-- Persist tool inventory and printable QR label exports in the private report store.
alter type public.report_type add value if not exists 'tool_inventory';
