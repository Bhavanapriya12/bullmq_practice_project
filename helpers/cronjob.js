const cron = require("node-cron");
const redisFunctions = require("./redisFunctions");
const functions = require("./functions");
const { api_token } = require("../routes/payment_routes/billers");
const axios = require("axios");
const mongoFunctions = require("./mongoFunctions");

async function get_categories_and_store_billers() {
  console.log("get_categories_and_store_billers called");
  const get_token = await api_token();
  console.log(get_token);

  const api = axios.create({
    baseURL: "https://stg.bc-api.bayad.com/v3",
    headers: {
      Authorization: `Bearer ${get_token}`,
      "Content-Type": "application/json",
    },
  });

  const categoriesResponse = await api.get("/billers?categoriesOnly=true");

  const categories = categoriesResponse.data.data;

  if (!categories || categories.length === 0) {
    console.error("No categories found");
    return;
  }

  for (const category of categories) {
    try {
      console.log(`Fetching billers for category: ${category}`);
      const billersResponse = await api.get(`/billers?category=${category}`);
      const billers = billersResponse.data.data;

      await redisFunctions.redisInsert("categories", category, billers, true);
      console.log(`Stored billers for category: ${category}`);
    } catch (err) {
      console.error(`Failed to fetch billers for category: ${category}`);
      console.error(err.message);
    }
  }

  console.log("All categories processed and stored in Redis.");
}

async function get_billers_store_database() {
  try {
    const get_token = await api_token();
    console.log(get_token);

    const api = axios.create({
      baseURL: "https://stg.bc-api.bayad.com/v3",
      headers: {
        Authorization: `Bearer ${get_token}`,
        "Content-Type": "application/json",
      },
    });

    const billersResponse = await api.get("/billers");
    const billers = billersResponse.data.data;

    if (!billers || billers.length === 0) {
      console.error("No billers found");
      return;
    }

    console.log("Processing billers...");

    for (const biller of billers) {
      try {
        console.log(`Fetching details for biller: ${biller.name}`);

        const billerResponse = await api.get(`/billers/${biller.code}`);
        const billerData = billerResponse.data.data;

        let otherCharges;

        try {
          const chargesResponse = await api.get(`/billers/${biller.code}/fees`);
          otherCharges = chargesResponse.data.data.otherCharges;
          console.log("othercharges'''''''", otherCharges);
        } catch (error) {
          console.error(
            `Failed to fetch charges for biller: ${biller.code}`,
            error.message
          );
          otherCharges = "NONE";
          console.log(otherCharges);
        }
        const billers_data = {
          biller_id: billerData.code,
          biller_name: billerData.name,
          description: billerData.description,
          category: billerData.category,
          status: billerData.status,
          type: billerData.type,
          other_charges: otherCharges,
          payload: {
            referenceNumber: {
              label: "Account Number",
              description: "Account Number",
              rules: {
                required: {
                  code: 4,
                  message: "Please provide the account number.",
                },
                numeric: {
                  code: 8,
                  message: "Please enter the account number in numeric format.",
                },
                "digits:10": {
                  code: 5,
                  message: "The account number must be 10 digits.",
                },
                "custom:enable_barcode": {
                  code: 45,
                  message: "There seems to be a problem in the barcode scanner",
                },
                "custom:NOT_FOUND": {
                  code: 3,
                  message:
                    "Oh no! We can’t find this Customer Account Number. Would you mind checking again? You’ll find your 10-digit Meralco CAN on the lower left portion of your latest Meralco bill.",
                },
                "transaction_limit:1000000": {
                  code: 13,
                  message:
                    "Uh oh! Your account has already reached maximum transactions with us for this month. To continue with your transaction, you may pay via the Meralco Mobile App, Meralco Online, or any Meralco Business Center near you. Thank you!",
                },
                "custom:WITH_DFO": {
                  code: 1,
                  message:
                    "Hey, your account is already for disconnection. A crew might already be on its way and your payment may not be posted in time to avoid disconnection. In case your service is disconnected, you will be reconnected within the next business day from the time your payment is posted. A reconnection fee will be included on your next bill. Do you still want to proceed?",
                },
                "custom:DISCONNECTED": {
                  code: 2,
                  message: "",
                },
              },
            },
            amount: {
              label: "Amount",
              description: "Amount to be paid",
              rules: {
                required: {
                  code: 4,
                  message: "Please provide the amount.",
                },
                numeric: {
                  code: 8,
                  message: "Please enter the amount in numeric format.",
                },
                wallet: {
                  code: 17,
                  message:
                    "The wallet balance of the customer is below the required amount.",
                },
                "min:5": {
                  code: 6,
                  message:
                    "Oops! Minimum amount due must be at least P5.00. Don’t worry, any excess amount will be carried over on your next billing statement.",
                },
                "max:100000": {
                  code: 7,
                  message:
                    "Oops! Your amount due exceeds our maximum limit amount. You may pay this amount via the Meralco Mobile App, Meralco Online, or any Meralco Business Center near you. Thank you!",
                },
              },
            },
            validationNumber: {
              label: "Validation Number",
              description: "Reference for checking validity",
              rules: {
                required: {
                  code: 4,
                  message: "Please provide the validation number.",
                },
                alpha_dash: {
                  code: 9,
                  message:
                    "Please make sure that the validation number is in alpha dash format.",
                },
                verification: {
                  code: 14,
                  message:
                    "The validation number provided is invalid. Please try entering this again.",
                },
              },
            },
          },
        };

        await mongoFunctions.update_one(
          "STATS",
          { biller_id: billerData.code },
          { $set: billers_data },
          { upsert: true }
        );

        console.log(`Stored biller: ${billerData.name}`);
      } catch (err) {
        console.error(`Error storing biller: ${biller.name}`);
        console.error(err);
      }
    }
  } catch (error) {
    console.error("Error in get_billers_store_database:", error.message);
  }
}

async function reschedule_transactions() {
  try {
    console.log("reschedule_transactions called");

    const api = await createApiInstance();
    const trans_data = await mongoFunctions.find("STATS", {
      status: "pending",
    });

    for (const data of trans_data) {
      try {
        const { client_reference, biller_code } = data;

        const response = await api.post(
          `/billers/${biller_code}/payments/${client_reference}`
        );

        console.log(
          `API call successful for client_reference: ${client_reference}`,
          response.data
        );

        await mongoFunctions.update_one(
          "STATS",
          { client_reference },
          { $set: { status: "processed" } }
        );
      } catch (error) {
        console.error(
          `Error processing client_reference: ${data.client_reference}`,
          error.message
        );
      }
    }
  } catch (error) {
    console.error("Error in reschedule_transactions:", error.message);
  }
}
// get_categories_and_store_billers();
// get_billers_store_database();
// Schedule Cron Jobs
cron.schedule(
  "53 16 * * *",
  async () => {
    console.log("Cron started: get_categories_and_store_billers");
    await get_categories_and_store_billers();
  },
  { scheduled: true, timezone: "Asia/Kolkata" }
);

cron.schedule(
  "35 11 * * *",
  async () => {
    console.log("Cron started: get_billers_store_database");
    await get_billers_store_database();
  },
  { scheduled: true, timezone: "Asia/Kolkata" }
);

module.exports = {
  get_categories_and_store_billers,
  get_billers_store_database,
  reschedule_transactions,
};
