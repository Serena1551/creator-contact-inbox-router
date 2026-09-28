export {};

const response = await fetch("http://localhost:3000/contact", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    requestId: crypto.randomUUID(),
    name: "Mina Chen",
    email: "mina@example.com",
    requestType: "digital_asset_delivery",
    message: "Please send the licensed photo pack for campaign C-104.",
    captchaToken: process.env.DEMO_CAPTCHA_TOKEN,
  }),
});

console.log(response.status, await response.json());
