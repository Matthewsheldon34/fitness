// Backend/routes/checkout.js
import express from "express";
import Stripe from "stripe";
import { sql } from "../db.js";
import process from "node:process";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ────────────────────────────────────────────────
// POST /api/checkout/create-session
// Body: { items: [{ productId: 2, quantity: 1 }] }
// ────────────────────────────────────────────────
router.post("/create-session", async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "No items in cart" });
  }

  try {
    // 1. Cast to numbers so a string "2" from the browser still matches BIGINT
    const productIds = items.map((i) => Number(i.productId));
    if (productIds.some((id) => !Number.isFinite(id))) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const products = await sql`
      SELECT id, name, price
      FROM products
      WHERE id = ANY(${productIds})
    `;

    if (products.length !== productIds.length) {
      return res.status(400).json({
        message: "One or more products not found",
        requested: productIds,
        found: products.map((p) => p.id),
      });
    }

    const byId = Object.fromEntries(products.map((p) => [String(p.id), p]));

    // 2. Compute the total on the server
    const lineItems = items.map((i) => {
      const p = byId[String(i.productId)];
      return { product: p, quantity: i.quantity, unitPrice: Number(p.price) };
    });

    const total = lineItems.reduce(
      (sum, li) => sum + li.unitPrice * li.quantity,
      0
    );

    // 3. Insert order as pending
    const [order] = await sql`
      INSERT INTO orders (user_id, total_amount, status)
      VALUES (${req.user?.id ?? null}, ${total}, 'pending')
      RETURNING id
    `;
    const orderId = order.id;

    // 4. Insert order_items
    for (const li of lineItems) {
      await sql`
        INSERT INTO order_items (order_id, product_name, quantity, price)
        VALUES (${orderId}, ${li.product.name}, ${li.quantity}, ${li.unitPrice})
      `;
    }

    // 5. Normalize CLIENT URL
    const CLIENT = (process.env.CLIENT_URL || "https://fitness-1-od9s.onrender.com")
      .trim()
      .replace(/\/+$/, "");

    // 6. Create the Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems.map((li) => ({
        price_data: {
          currency: "usd",
          product_data: { name: li.product.name },
          unit_amount: Math.round(li.unitPrice * 100),
        },
        quantity: li.quantity,
      })),
      client_reference_id: orderId.toString(),
      success_url: `${CLIENT}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT}/cancel`,
    });

    // 7. Save the session ID so the webhook can find this order
    await sql`
      UPDATE orders SET stripe_session_id = ${session.id} WHERE id = ${orderId}
    `;

    res.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({
      message: "Failed to create checkout session",
      detail: err.message,
    });
  }
});

// ────────────────────────────────────────────────
// GET /api/checkout/order-status/:sessionId
// Polled by /success to confirm the webhook has marked
// the order as paid.
// ────────────────────────────────────────────────
router.get("/order-status/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId || !sessionId.startsWith("cs_")) {
    return res.status(400).json({ message: "Invalid session ID" });
  }

  try {
    const rows = await sql`
      SELECT id, status, total_amount, stripe_session_id, created_at
      FROM orders
      WHERE stripe_session_id = ${sessionId}
      LIMIT 1
    `;

    if (!rows[0]) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = rows[0];
    res.json({
      orderId: order.id,
      status: order.status, // pending | paid | failed | cancelled | refunded
      total: Number(order.total_amount),
      createdAt: order.created_at,
    });
  } catch (err) {
    console.error("Order status error:", err);
    res.status(500).json({
      message: "Failed to load order",
      detail: err.message,
    });
  }
});

export default router;