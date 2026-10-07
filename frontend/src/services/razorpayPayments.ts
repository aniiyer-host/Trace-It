export interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export type RazorpayCheckoutResult =
  | { type: "success"; response: RazorpayCheckoutResponse }
  | {
      type: "payment_failed";
      razorpay_payment_id?: string;
      razorpay_order_id?: string;
      error_code?: string;
      error_description?: string;
    }
  | { type: "dismissed" };

interface RazorpayFailureEvent {
  error?: {
    code?: string;
    description?: string;
    metadata?: {
      order_id?: string;
      payment_id?: string;
    };
  };
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayCheckoutResponse) => void;
  modal: { ondismiss: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (
      options: RazorpayCheckoutOptions,
    ) => {
      open: () => void;
      close: () => void;
      on: (
        event: "payment.failed",
        callback: (response: RazorpayFailureEvent) => void,
      ) => void;
    };
  }
}

let checkoutScript: Promise<void> | undefined;

const loadCheckoutScript = () => {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScript) return checkoutScript;

  checkoutScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) {
        resolve();
      } else {
        checkoutScript = undefined;
        reject(new Error("Razorpay Checkout did not initialize"));
      }
    };
    script.onerror = () => {
      checkoutScript = undefined;
      reject(new Error("Failed to load Razorpay Checkout"));
    };
    document.body.appendChild(script);
  });

  return checkoutScript;
};

export const openRazorpayCheckout = async (
  options: Omit<RazorpayCheckoutOptions, "handler" | "modal">,
): Promise<RazorpayCheckoutResult> => {
  await loadCheckoutScript();
  const RazorpayCheckout = window.Razorpay;
  if (!RazorpayCheckout) {
    throw new Error("Razorpay Checkout is unavailable");
  }

  return new Promise<RazorpayCheckoutResult>((resolve) => {
    let settled = false;
    const settle = (result: RazorpayCheckoutResult) => {
      if (settled) {
        console.info(
          "[Razorpay Checkout Debug] Ignoring callback because the result is already settled.",
          { attemptedOutcome: result.type },
        );
        return false;
      }
      settled = true;
      console.info("[Razorpay Checkout Debug] Settling checkout result.", {
        outcome: result.type,
      });
      resolve(result);
      return true;
    };

    const checkout = new RazorpayCheckout({
      ...options,
      handler: (response) => {
        console.info("[Razorpay Checkout Debug] Success handler fired.");
        settle({ type: "success", response });
      },
      modal: {
        ondismiss: () => {
          console.info("[Razorpay Checkout Debug] Modal ondismiss fired.");
          settle({ type: "dismissed" });
        },
      },
    });
    console.info("[Razorpay Checkout Debug] Checkout instance created.");

    checkout.on("payment.failed", (response) => {
      console.info(
        "[Razorpay Checkout Debug] payment.failed event fired.",
      );
      const paymentId = response.error?.metadata?.payment_id;
      const orderId = response.error?.metadata?.order_id;
      const errorCode = response.error?.code;
      const errorDescription = response.error?.description;

      if (
        settle({
          type: "payment_failed",
          ...(typeof paymentId === "string" && paymentId.length > 0
            ? { razorpay_payment_id: paymentId }
            : {}),
          ...(typeof orderId === "string" && orderId.length > 0
            ? { razorpay_order_id: orderId }
            : {}),
          ...(typeof errorCode === "string" ? { error_code: errorCode } : {}),
          ...(typeof errorDescription === "string"
            ? { error_description: errorDescription }
            : {}),
        })
      ) {
        console.info(
          "[Razorpay Checkout Debug] Calling checkout.close() after payment.failed.",
        );
        try {
          checkout.close();
        } finally {
          console.info(
            "[Razorpay Checkout Debug] checkout.close() attempt finished.",
          );
        }
      }
    });

    console.info("[Razorpay Checkout Debug] Calling checkout.open().");
    checkout.open();
    console.info("[Razorpay Checkout Debug] checkout.open() call returned.");
  });
};
