-- =====================================================================
-- XML and XPath demonstration (PostgreSQL has a native XML type)
-- Builds an XML document for every payslip, then queries it with XPath.
-- Run each numbered block separately and screenshot the results.
-- Needs payslips to exist (Cycle 1 payroll already processed).
-- =====================================================================

-- ---------- X0: create the XML documents ----------
create schema if not exists tests;
create table if not exists tests.payslip_xml (
  payslip_id bigint primary key,
  doc xml not null
);

insert into tests.payslip_xml (payslip_id, doc)
select ps.id,
       xmlelement(name payslip, xmlattributes(ps.id as id),
         xmlelement(name employee, xmlattributes(e.employee_no as no), e.first_name || ' ' || e.last_name),
         xmlelement(name period, pp.label),
         xmlelement(name hours,
           xmlelement(name regular, ps.regular_hours),
           xmlelement(name overtime, ps.overtime_hours)),
         xmlelement(name gross, ps.gross_pay),
         xmlelement(name allowances, ps.total_allowances),
         xmlelement(name deductions, ps.total_deductions),
         xmlelement(name net, ps.net_pay),
         (select xmlagg(
                   xmlelement(name line, xmlattributes(pl.line_type as type),
                     xmlforest(pl.description as description, pl.amount as amount))
                   order by pl.id)
          from payslip_lines pl where pl.payslip_id = ps.id))
from payslips ps
join employees e on e.id = ps.employee_id
join pay_periods pp on pp.id = ps.period_id
on conflict (payslip_id) do update set doc = excluded.doc;

select count(*) as xml_documents from tests.payslip_xml;


-- ---------- X1: look at one XML document ----------
select payslip_id, doc from tests.payslip_xml order by payslip_id limit 1;


-- ---------- X2: XPath extraction: employee and net pay for every payslip ----------
select payslip_id,
       (xpath('/payslip/employee/text()', doc))[1]::text as employee,
       ((xpath('/payslip/net/text()', doc))[1]::text)::numeric as net_pay
from tests.payslip_xml
order by net_pay desc;


-- ---------- X3: XPath attribute and predicate: one employee by number ----------
select payslip_id, (xpath('/payslip/net/text()', doc))[1]::text as net_pay
from tests.payslip_xml
where (xpath('/payslip/employee/@no', doc))[1]::text = 'EMP0003';


-- ---------- X4: XPath with a condition on a child value: payslips with overtime ----------
select (xpath('/payslip/employee/text()', doc))[1]::text as employee,
       (xpath('/payslip/hours/overtime/text()', doc))[1]::text as overtime_hours
from tests.payslip_xml
where ((xpath('/payslip/hours/overtime/text()', doc))[1]::text)::numeric > 0
order by 2 desc;


-- ---------- X5: XPath on repeating elements: every deduction line of one payslip ----------
select unnest(xpath('/payslip/line[@type="deduction"]/description/text()', doc))::text as deduction
from tests.payslip_xml
where (xpath('/payslip/employee/@no', doc))[1]::text = 'EMP0003';


-- ---------- X6: xmlexists: payslips whose net pay is above 1000 ----------
select (xpath('/payslip/employee/text()', doc))[1]::text as employee
from tests.payslip_xml
where xmlexists('/payslip[net > 1000]' passing by value doc);


-- ---------- X7: aggregate over XML values ----------
select sum(((xpath('/payslip/net/text()', doc))[1]::text)::numeric) as total_net_from_xml
from tests.payslip_xml;
-- This total should equal the sum of net_pay in the payslips table.

-- Cleanup (optional):  drop table tests.payslip_xml;