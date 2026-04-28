"""PDF invoice generation for maintenance tickets."""
from io import BytesIO
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer
from reportlab.lib.units import cm

from app.deps import get_db, get_current_user

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


def _build_invoice_pdf(tenant: dict, m: dict) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm)
    styles = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=styles["Title"], fontSize=18, alignment=1)
    n = ParagraphStyle("n", parent=styles["Normal"], fontSize=10)
    small = ParagraphStyle("s", parent=styles["Normal"], fontSize=8, textColor=colors.gray)

    elements = []
    shop = tenant.get("name", "Repair Shop")
    elements.append(Paragraph(f"<b>{shop}</b>", h))
    if tenant.get("phone"):
        elements.append(Paragraph(f"Phone: {tenant['phone']}", n))
    if tenant.get("address"):
        elements.append(Paragraph(tenant["address"], n))
    elements.append(Spacer(1, 0.4*cm))
    elements.append(Paragraph(f"<b>INVOICE / Receipt</b>", h))
    elements.append(Paragraph(f"Ticket #{m['id'][:8]}", small))
    elements.append(Paragraph(f"Date: {m.get('created_at','')[:19]}", small))
    elements.append(Spacer(1, 0.3*cm))

    info = [
        ["Customer", m.get("customer_name", "")],
        ["Phone", m.get("customer_phone", "")],
        ["Device", f"{m.get('device_type','')} {m.get('device_model','') or ''}"],
        ["Issue", m.get("issue", "")],
        ["Status", m.get("status", "")],
    ]
    t1 = Table(info, colWidths=[4*cm, 12*cm])
    t1.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F3F4F6")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(t1)
    elements.append(Spacer(1, 0.5*cm))

    # Parts table
    parts = m.get("parts_used") or []
    if parts:
        data = [["Part", "Qty", "Price", "Subtotal"]]
        for p in parts:
            sub = (p.get("price", 0) or 0) * (p.get("qty", 1) or 1)
            data.append([p.get("name", ""), str(p.get("qty", 1)), f"{p.get('price',0):,.0f}", f"{sub:,.0f}"])
        t2 = Table(data, colWidths=[8*cm, 2*cm, 3*cm, 3*cm])
        t2.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ]))
        elements.append(t2)
        elements.append(Spacer(1, 0.4*cm))

    cur = tenant.get("currency", "IQD")
    totals = [
        ["Agreed Price", f"{m.get('agreed_price', 0):,.0f} {cur}"],
        ["Paid", f"{m.get('paid_amount', 0):,.0f} {cur}"],
        ["Debt", f"{m.get('debt_amount', 0):,.0f} {cur}"],
    ]
    t3 = Table(totals, colWidths=[12*cm, 4*cm])
    t3.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#FEF3C7")),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(t3)
    elements.append(Spacer(1, 1*cm))
    elements.append(Paragraph("Thank you for your business.", small))

    doc.build(elements)
    buf.seek(0)
    return buf.read()


@router.get("/maintenance/{mid}")
async def invoice_pdf(mid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    m = await db.maintenance.find_one({"id": mid, "tenant_id": user["tenant_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Not found")
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0}) or {}
    pdf = _build_invoice_pdf(tenant, m)
    return StreamingResponse(BytesIO(pdf), media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="invoice-{m["id"][:8]}.pdf"',
    })
