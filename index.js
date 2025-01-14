const express = require("express");
const bodyParser = require("body-parser");
const { SessionsClient } = require("@google-cloud/dialogflow-cx");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

// Path to your service account key file
const keyFilePath = "./virtual-agent-test-447708-9afff711c09f.json";

const app = express();
app.use(bodyParser.urlencoded({ extended: true })); // Handle URL-encoded form data
app.use(bodyParser.json()); // Handle JSON payloads

// Instantiate Dialogflow CX client
const client = new SessionsClient({
  keyFilename: keyFilePath,
  apiEndpoint: "us-central1-dialogflow.googleapis.com",
});

const moment = require("moment-timezone");
const { google } = require("googleapis");
const { JWT } = require("google-auth-library");
const calendarId = process.env.CALENDAR_ID;
const serviceAccount = require("./virtual-agent-test-447708-9afff711c09f.json");
const auth = new JWT({
  email: serviceAccount.client_email,
  key: serviceAccount.private_key,
  scopes: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ],
});
const calendar = google.calendar({ version: "v3", auth });

app.post("/twilio-webhook", async (req, res) => {
  try {
    console.log("Twilio Webhook");

    const sessionId = req.query.session;
    const name = req.query.name;
    const email = req.query.email;

    // Session path with environment 'draft' for testing (use 'production' in live environments)
    const sessionPath = `projects/virtual-agent-test-447708/locations/us-central1/agents/1ded5a13-43d3-480d-8e35-86956f61245e/environments/draft/sessions/${sessionId}`;

    console.log("req.body", req.body);
    // Extract speech input from Twilio's webhook
    const userInput = req.body.SpeechResult || ""; // Speech-to-Text from Twilio
    console.log("userInput", userInput);
    const isInitialRequest = !userInput; // Check if this is the first request

    const queryInput = isInitialRequest
      ? { text: { text: "hi" }, languageCode: "en" } // Trigger welcome event
      : { text: { text: userInput }, languageCode: "en" }; // Handle user input

    // Prepare the request for Dialogflow CX's detectIntent method

    const request = {
      session: sessionPath,
      queryInput,
      queryParams: {
        parameters: {
          fields: {
            name: { kind: "stringValue", stringValue: name },
            email: { kind: "stringValue", stringValue: email },
          },
        },
      },
    };
    console.log("request", request);
    // Get the response from Dialogflow CX
    const [response] = await client.detectIntent(request);
    console.log("response");
    console.log(response);

    const botReply = response.queryResult.responseMessages
      .map((message) => message.text?.text[0])
      .filter(Boolean)
      .join(" ");
    console.log("BOTREPLYU", botReply);
    // Create TwiML response
    const twiml = new (require("twilio").twiml.VoiceResponse)();

    if (botReply) {
      // Say the bot's response
      twiml.say(botReply);

      // Use Gather to wait for user input
      const gather = twiml.gather({
        input: "speech", // Listen for speech
        timeout: 10, // 5 seconds timeout
        speechTimeout: "auto", // Automatically determine when speech ends
        action: `https://129f-2405-201-f01e-787d-52fd-d5f1-9111-5d15.ngrok-free.app/twilio-webhook?session=${sessionId}&name=${name}&email=${email}`, // Loop back to the same endpoint
      });
      // gather.say("You can respond now.");
    } else {
      // If no response, end the call
      twiml.say("Goodbye!");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());

    // Check if the response contains any messages
    // let botReply = "";
    // if (
    //   response.queryResult.responseMessages &&
    //   response.queryResult.responseMessages.length > 0
    // ) {
    //   botReply = response.queryResult.responseMessages[0].text.text[0];
    // } else {
    //   botReply = "Sorry, I didn't understand that.";
    // }

    // // Send the bot's reply back to Twilio as a voice response
    // res.send(`<Response><Say>${botReply}</Say></Response>`);
  } catch (error) {
    console.error("Error during Dialogflow CX interaction:", error);
    // End the call in case of an error
    const twiml = new (require("twilio").twiml.VoiceResponse)();
    twiml.say("An error occurred. Goodbye!");
    twiml.hangup();

    res.type("text/xml");
    res.send(twiml.toString());
  }
});

function generateDialogflowResponse(sampleTexts) {
  const messages = sampleTexts.map((text) => ({
    text: {
      text: [text],
      redactedText: [text],
    },
    responseType: "ENTRY_PROMPT",
    source: "VIRTUAL_AGENT",
  }));
  return {
    fulfillmentResponse: {
      messages: messages,
    },
  };
}

const handleCreateEvent = async (req) => {
  try {
    /**
     * [1] extract the information from the request
     * [2] make sure to handle the note part
     * [3] create an event
     * [4] send back a response
     */
    console.log("req.body", req.body);
    const { parameters } = extractDataFromDialogflow(req.body);
    const { startDateTime, endDateTime } = createDateRange(
      parameters["date-time"]
    );
    const eventDetails = {
      summary: `New appointment for ${parameters.name}`,
      description: `Here are the meeting details:
          Email: ${parameters.email}`,
      startDateTime,
      endDateTime,
    };
    console.log("eventDetails", eventDetails);
    const eventData = await createEvent(eventDetails);
    console.log(eventData);
    const responseData = generateDialogflowResponse([
      "Thank you for calling in, your appointment has been scheduled, and someone from the team will contact you soon.",
    ]);
    return responseData;
  } catch (error) {
    console.error("Error in create-event route:", error);
  }
};
const extractDataFromDialogflow = (response) => {
  const { parameters } = response.sessionInfo;
  const { messages } = response;
  return {
    parameters,
    fulfillmentResponse: {
      messages,
    },
  };
};
const createDateRange = (dateTime, timezone) => {
  const startDateTime = moment.tz(
    [
      dateTime.year,
      dateTime.month - 1,
      dateTime.day,
      dateTime.hours,
      dateTime.minutes,
      dateTime.seconds,
    ],
    timezone
  );
  const endDateTime = startDateTime.clone().add(30, "minutes");
  return {
    startDateTime: startDateTime.format(),
    endDateTime: endDateTime.format(),
  };
};

const createEvent = async (eventDetails) => {
  const { summary, description, startDateTime, endDateTime } = eventDetails;
  const event = {
    summary,
    description,
    start: {
      dateTime: startDateTime,
      timeZone: "Asia/Kolkata",
    },
    end: {
      dateTime: endDateTime,
      timeZone: "Asia/Kolkata",
    },
  };
  try {
    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
      sendUpdates: "all",
    });
    return response.data;
  } catch (error) {
    console.error("Error creating event: ", error);
    throw error;
  }
};
app.post("/dialogflow-webhook", async (req, res) => {
  console.log(JSON.stringify(req.body));

  try {
    const tag = req.body.fulfillmentInfo.tag;
    let responseData = null;
    if (tag === "scheduleMeeting") {
      responseData = await handleCreateEvent(req);
    } else {
      responseData = generateDialogflowResponse([
        `No handler for the tag ${tag}.`,
      ]);
    }

    res.send(responseData);
  } catch (error) {
    console.error("Error creating calendar event:", error);
    res.status(500).json({ message: "Failed to schedule the meeting." });
  }
});
app.listen(3000, () => console.log("Server running on port 3000"));
