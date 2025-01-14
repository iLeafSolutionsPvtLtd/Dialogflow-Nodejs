// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.AUTH_TOKEN;
const client = twilio(accountSid, authToken);

let users = [
  {
    name: "abc",
    email: "abc@ileafsolutions.net",
    phone: "+9199999999",
  },
];
async function createCall(user) {
  const sessionId = await uuidv4(); // Generate unique session ID
  console.log("sessionId", sessionId);
  const call = await client.calls.create({
    from: process.env.PHONE,
    to: user.phone,
    url: `https://129f-2405-201-f01e-787d-52fd-d5f1-9111-5d15.ngrok-free.app/twilio-webhook?session=${sessionId}&name=${user.phone}&email=${user.email}`,
  });

  console.log(call.sid);
}

for (const user of users) {
  createCall(user);
}
