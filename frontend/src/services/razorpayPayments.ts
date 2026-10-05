export interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
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
    ) => { open: () => void };
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
) => {
  await loadCheckoutScript();
  const RazorpayCheckout = window.Razorpay;
  if (!RazorpayCheckout) {
    throw new Error("Razorpay Checkout is unavailable");
  }

  return new Promise<RazorpayCheckoutResponse | null>((resolve) => {
    const checkout = new RazorpayCheckout({
      ...options,
      handler: resolve,
      modal: { ondismiss: () => resolve(null) },
    });
    checkout.open();
  });
};
