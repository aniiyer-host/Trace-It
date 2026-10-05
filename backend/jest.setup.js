import dotenv from "dotenv";
import { jest } from "@jest/globals";
dotenv.config({ path: ".env.test" });

process.env.RAZORPAY_KEY_ID ??= "rzp_test_mock";
process.env.RAZORPAY_KEY_SECRET ??= "razorpay-test-secret";
process.env.RAZORPAY_WEBHOOK_SECRET ??= "razorpay-webhook-test-secret";

jest.mock("razorpay", () => {
  const ordersById = new Map();
  const MockRazorpay = jest.fn().mockImplementation(() => ({
    orders: {
      create: jest.fn(async (order) => {
        const createdOrder = {
          id: `order_test_${order.notes.donationId}`,
          entity: "order",
          amount: order.amount,
          amount_paid: 0,
          amount_due: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          notes: order.notes,
          status: "created",
          attempts: 0,
          created_at: Math.floor(Date.now() / 1000),
        };
        ordersById.set(createdOrder.id, createdOrder);
        return createdOrder;
      }),
      fetch: jest.fn(async (orderId) => {
        const order = ordersById.get(orderId);
        return order ? { ...order, status: "paid", amount_paid: order.amount } : undefined;
      }),
    },
    payments: {
      fetch: jest.fn(async (paymentId) => {
        const order = Array.from(ordersById.values()).at(-1);
        return {
          id: paymentId,
          order_id: order.id,
          amount: order.amount,
          currency: order.currency,
          status: "captured",
          captured: true,
        };
      }),
    },
  }));

  return { __esModule: true, default: MockRazorpay };
});
