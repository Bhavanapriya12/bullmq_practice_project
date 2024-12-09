const cron = require("node-cron");
const redis_functions = require("./redisFunctions");
const functions = require("./functions");
const { api_token } = require("../routes/payment_routes/billers");
const axios = require("axios");
const mongo_functions = require("./mongoFunctions");

async function process_categories_and_billers() {
  try {
    console.log("Starting to process categories and billers...");
    const token = await api_token();

    const api = axios.create({
      baseURL: "https://stg.bc-api.bayad.com/v3",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    // Fetch categories and store in Redis
    const categories_response = await api.get("/billers?categoriesOnly=true");
    const categories = categories_response.data.data;

    if (!categories || categories.length === 0) {
      console.error("No categories found");
      return;
    }

    await redis_functions.store_categories_in_redis(categories);
    console.log("Categories stored in Redis.");

    // Fetch billers for each category and store in Redis
    for (const category of categories) {
      try {
        console.log(`Processing billers for category: ${category}`);
        const billers_response = await api.get(`/billers?category=${category}`);
        const billers = billers_response.data.data;

        await redis_functions.store_billers_by_category(category, billers);
        console.log(`Stored billers for category: ${category}`);
      } catch (err) {
        console.error(
          `Error fetching billers for category ${category}:`,
          err.message
        );
      }
    }

    // Fetch all billers and store in MongoDB
    const all_billers_response = await api.get("/billers");
    const all_billers = all_billers_response.data.data;

    if (!all_billers || all_billers.length === 0) {
      console.error("No billers found");
      return;
    }

    for (const biller of all_billers) {
      try {
        const biller_response = await api.get(`/billers/${biller.code}`);
        const biller_data = biller_response.data.data;

        let other_charges;
        try {
          const charges_response = await api.get(
            `/billers/${biller.code}/fees`
          );
          other_charges = charges_response.data.data.otherCharges;
        } catch (error) {
          console.error(
            `Error fetching charges for biller ${biller.code}:`,
            error.message
          );
          other_charges = "NONE";
        }

        const billers_data = {
          biller_id: biller_data.code,
          biller_name: biller_data.name,
          description: biller_data.description,
          category: biller_data.category,
          status: biller_data.status,
          type: biller_data.type,
          other_charges: other_charges,
          payload: biller_data.parameters.verify,
        };

        await mongo_functions.update_one(
          "STATS",
          { biller_id: biller_data.code },
          { $set: billers_data },
          { upsert: true }
        );
        console.log(`Stored biller: ${biller_data.name}`);
      } catch (err) {
        console.error(`Error storing biller ${biller.name}:`, err.message);
      }
    }
    console.log("Categories and billers processed successfully.");
  } catch (err) {
    console.error("Error in process_categories_and_billers:", err.message);
  }
}

async function reschedule_transactions() {
  try {
    console.log("Rescheduling transactions...");
    const token = await api_token();

    const api = axios.create({
      baseURL: "https://stg.bc-api.bayad.com/v3",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const pending_transactions = await mongo_functions.find("HISTORY", {
      payment_status: "PENDING",
    });

    for (const transaction of pending_transactions) {
      try {
        const { biller_id, transaction_id, client_reference } = transaction;

        const response = await api.get(
          `/billers/${biller_id}/payments/${client_reference}`
        );
        const payment_status = response.data.data.status;

        await mongo_functions.update_one(
          "HISTORY",
          { transaction_id },
          { $set: { payment_status } }
        );

        if (payment_status === "FAILED") {
          await functions.refund_amount(
            transaction.sender_id,
            transaction.amount
          );
          console.log(`Refund processed for transaction: ${transaction_id}`);
        }
      } catch (err) {
        console.error(
          `Error processing transaction ${transaction.transaction_id}:`,
          err.message
        );
      }
    }
    console.log("Transactions rescheduled successfully.");
  } catch (err) {
    console.error("Error in reschedule_transactions:", err.message);
  }
}

cron.schedule(
  "55 16 * * *",
  async () => {
    console.log("cron started...");
    await process_categories_and_billers();
    await reschedule_transactions();
    console.log("cron completed.");
  },
  { scheduled: true, timezone: "Asia/Kolkata" }
);

module.exports = {
  process_categories_and_billers,
  reschedule_transactions,
};
