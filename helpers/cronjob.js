const cron = require("node-cron");
const redisFunctions = require("./redisFunctions");
const functions = require("./functions");
const { api_token } = require("../routes/payment_routes/billers");
const axios = require("axios");
const mongoFunctions = require("./mongoFunctions");

async function get_categories_and_store_billers() {
  try {
    console.log("function called");
    const get_token = await api_token();
    console.log("token------------->", get_token);

    const api = axios.create({
      baseURL: "https://stg.bc-api.bayad.com/v3",
      headers: {
        Authorization: `Bearer ${get_token}`,
        "Content-Type": "application/json",
      },
    });

    const categoriesResponse = await api.get("/billers?categoriesOnly=true");
    const categories = categoriesResponse.data.data;
    console.log(categories);

    if (!categories || categories.length === 0) {
      console.error("No categories found");
      return;
    }

    for (const category of categories) {
      try {
        console.log(`Fetching billers for category: ${category}`);
        const billersResponse = await api.get(`/billers?category=${category}`);
        const billers = billersResponse.data.data;
        console.log(billers);

        await redisFunctions.redisInsert("categories", category, billers, true);

        console.log(`Stored billers for category: ${category}`);
      } catch (err) {
        console.error(`Failed to fetch billers for category: ${category}`);
        console.error(err.message);
      }
    }

    console.log("All categories processed and stored in Redis.");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

async function get_billers_store_database() {
  try {
    console.log("function called");
    const get_token = await api_token();
    console.log("token------------->", get_token);

    console.log("Token fetched:", get_token);

    // Set up Axios with the token
    const api = axios.create({
      baseURL: "https://stg.bc-api.bayad.com/v3",
      headers: {
        Authorization: `Bearer ${get_token}`,
        "Content-Type": "application/json",
      },
    });

    // Fetch the billers list
    const billersResponse = await api.get("/billers");
    console.log("Billers Response:", billersResponse.data);

    const billers = billersResponse.data.data;

    if (!billers || billers.length === 0) {
      console.error("No billers found");
      return;
    }

    console.log("Processing billers...");

    for (const biller of billers) {
      try {
        console.log(`Fetching details for biller: ${biller.name}`);

        // Fetch detailed information for each biller
        const billerResponse = await api.get(`/billers/${biller.code}`);
        const billerData = billerResponse.data.data;

        // Prepare biller data for storage
        const billers_data = {
          biller_id: billerData.code,
          biller_name: billerData.name,
          description: billerData.description,
          category: billerData.category,
          status: billerData.status,
          type: billerData.type,
          other_charges: "0.00",
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

        // Store in the database
        await mongoFunctions.insert_many_records("STATS", [billers_data]);

        console.log(`Stored biller: ${billerData.name}`);
      } catch (err) {
        console.error(`Failed to store biller ${biller.name}`);
        console.error(err.message);
      }
    }

    console.log("All billers processed and stored in the database.");
  } catch (error) {
    console.error("Error occurred:", error.message);
  }
}

//cron job to reschedule pending payments

async function reschedule_transactions(){

  


}





cron.schedule(
  "41 16 * * *",
  async () => {
    try {
      console.log("cron started");
      await get_categories_and_store_billers();
      console.log("Running a job every day to get and store categories");
    } catch (err) {
      console.error("Error in cron job:", err.message);
    }
  },
  { scheduled: true, timezone: "Asia/Kolkata" }
);
cron.schedule(
  "5 16 * * *",
  async () => {
    try {
      console.log("cron started");
      await get_billers_store_database();
      console.log("Running a job every day to get and store billers");
    } catch (err) {
      console.error("Error in cron job:", err.message);
    }
  },
  { scheduled: true, timezone: "Asia/Kolkata" }
);
