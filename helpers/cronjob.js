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
        // console.log(billerData);

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
            referenceNumber:
              billerData.parameters?.verify?.[0]?.referenceNumber?.label ||
              "NONE",
            amount: billerData.parameters?.verify?.[2]?.amount?.label || "NONE",
            validationNumber:
              billerData.parameters?.transact?.[1]?.validationNumber?.label ||
              "NONE",
            otherInfo: {
              billMonth:
                billerData.parameters?.verify?.[4]?.["otherInfo.BillMonth"]
                  ?.label || "",
              accountName:
                billerData.parameters?.verify?.[5]?.["otherInfo.AccountName"]
                  ?.label || "",
              dueDate:
                billerData.parameters?.verify?.[6]?.["otherInfo.DueDate"]
                  ?.label || "",
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
