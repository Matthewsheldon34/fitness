import express from "express";
import Stripe from "stripe";
import { sql } from "./db.js";
import process from "node:process";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  try {
    const session = event.data.object;
    const orderId = session.client_reference_id;

    if (
      event.type === "checkout.session.completed" &&
      session.payment_status === "paid"
    ) {
      await sql`
        UPDATE orders
        SET status = 'paid', stripe_session_id = ${session.id}
        WHERE stripe_session_id = ${session.id}
          OR id::text = ${orderId ?? ""}
      `;
    } else if (event.type === "checkout.session.async_payment_succeeded") {
      await sql`
        UPDATE orders
        SET status = 'paid', stripe_session_id = ${session.id}
        WHERE stripe_session_id = ${session.id}
          OR id::text = ${orderId ?? ""}
      `;

    } else if (event.type === "checkout.session.async_payment_failed") {
      await sql`
        UPDATE orders
        SET status = 'failed', stripe_session_id = ${session.id}
        WHERE stripe_session_id = ${session.id}
          OR id::text = ${orderId ?? ""}
      `;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(500).json({ message: "Webhook processing failed" });
  }
});

export default router;