-- PO Number is now entered manually by HO1 when placing an order, instead
-- of being auto-assigned from po_number_seq. Existing orders keep the
-- numbers they were already given; the column stays required and unique.

alter table orders alter column po_number drop default;

drop function if exists peek_next_po_number();

drop sequence if exists po_number_seq;
