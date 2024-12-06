const bcrypt = require("bcrypt");
const mongoFunctions = require("./mongoFunctions");
const moment = require("moment");
const {
  update_redis,
  genOtp,
  redisGetSingle,
  redis_set_with_expiration,
  store_billers_in_redis,
  redisGetAll,
  redisGet,
  store_categories_in_redis,
  redisGetFromHash,
  get_categories,
} = require("./redisFunctions");
const axios = require("axios");

//function for expiration

function is_token_expired(token) {
  const tokenData = parseJwt(token);
  const currentTime = Math.floor(Date.now() / 1000);
  return tokenData.exp < currentTime;
}
//parsejwt function

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`)
        .join("")
    );
    console.log(jsonPayload);
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Error parsing JWT:", error);
    return null;
  }
}

//request to get auth token

async function api_token() {
  const stored_token = await redisGetSingle("bayad_api_token");
  console.log("stored token-------------->", stored_token);
  if (!stored_token || is_token_expired(stored_token)) {
    console.log(
      "Stored token is missing or expired. Generating a new token..."
    );

    // if (!stored_token) {
    console.log("generating new token");
    const username = "36ddltnlmkmqkmbu3a81tp6pkm";
    const password = "6l9nefmg8j2cprdf37au5agu3sidaa6lp6tfk0n7qicgs8v7stq";
    const tpa_id = "E0GG";
    const scope = "mecom-auth/all";

    const data = {
      grant_type: "client_credentials",
      tpa_id: tpa_id,
      scope: scope,
    };

    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: "https://stg.bc-api.bayad.com/v3/oauth2/token",
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
      },
      data: data,
    };

    try {
      const response = await axios(config);

      const token = response.data.access_token;
      await redis_set_with_expiration("bayad_api_token", token, 3500);

      console.log("Generated Token:", token);
      return token;
    } catch (error) {
      console.error("Error generating token:", error.message || error);
      throw error;
    }
  }
  return stored_token;
}

module.exports = {
  hash_password: (password) => {
    const salt = bcrypt.genSaltSync(10);
    const hashed_password = bcrypt.hashSync(password, salt);
    return hashed_password;
  },

  compare_password: (password, hashed_password) => {
    b = bcrypt.compareSync(password, hashed_password);
    if (b) return true;
    else return false;
  },
  generate_reference_number: async (tpa_id) => {
    if (!tpa_id || tpa_id.length !== 4) {
      throw new Error("TPA ID must be 4 characters.");
    }

    const now = moment();
    const year = now.format("YY");
    const dayOfYear = now.dayOfYear().toString().padStart(3, "0");
    const today = now.format("YYYY-MM-DD");

    const sequenceDoc = await mongoFunctions.find_one_and_update(
      "DATA",
      { tpa_id: tpa_id },
      { $inc: { sequence: 1 } }, // Increment the sequence
      { upsert: true, returnDocument: "after" }
    );

    const sequenceNumber = sequenceDoc.sequence.toString().padStart(7, "0");
    const clientReference = `${tpa_id}${year}${dayOfYear}${sequenceNumber}`;

    return clientReference;
  },
  processing_payment: async (data) => {
    try {
      if (!data.biller_id || !data.sender_id || !data.validationNumber) {
        throw new Error(
          "Missing required fields: biller_id, sender_id, or validationNumber."
        );
      }

      const token = await api_token();
      const clientReference = data.clientReference || "DEFAULT_REF";
      const validationNumber = data.validationNumber;

      const requestData = {
        clientReference,
        validationNumber,
      };

      const config = {
        method: "post",
        maxBodyLength: Infinity,
        url: `https://stg.bc-api.bayad.com/v3/billers/${data.biller_id}/payments`,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        data: requestData,
      };

      console.log("Request Data:", requestData);

      const createPayamount = await axios(config);
      console.log("API Response:", createPayamount.data);

      const transactions_data = {
        amount: createPayamount.data.data.amount,
        sender_id: data.sender_id,
        biller_id: data.biller_id,
        transaction_id: createPayamount.data.data.transactionId,
        reference_number: createPayamount.data.data.referenceNumber,
        client_reference: createPayamount.data.data.clientReference,
        payment_method: createPayamount.data.data.paymentMethod,
        payment_status: createPayamount.data.data.status,
        other_charges: createPayamount.data.data.otherCharges,
        total_amount: createPayamount.data.data.totalAmount
          ? createPayamount.data.data.totalAmount
          : createPayamount.data.data.amount,

        transaction_date: new Date(),
      };

      console.log("Transaction Data:", transactions_data);

      const user = await mongoFunctions.find_one("FILES", {
        user_id: data.sender_id,
      });

      if (user) {
        const newBalance =
          user.balance - parseFloat(transactions_data.total_amount);

        if (newBalance < 0) {
          throw new Error("Insufficient balance or limit exceeded.");
        }

        await mongoFunctions.find_one_and_update(
          "FILES",
          { user_id: data.sender_id },
          { $set: { balance: newBalance } }
        );

        await mongoFunctions.create_new_record("HISTORY", transactions_data);

        return {
          success: true,
          message: "Transaction completed successfully!",
        };
      } else {
        throw new Error("User not found.");
      }
    } catch (error) {
      console.error("Error during transaction:", error.message);
      if (error.response) {
        console.error("Response data:", error.response.data);
        console.error("Status code:", error.response.status);
        console.error("Headers:", error.response.headers);
      }

      const failureData = {
        sender_id: data.sender_id,
        biller_id: data.biller_id,
        payment_status: "FAILED",
        transaction_date: new Date(),
      };

      await mongoFunctions.find_one_and_update(
        "HISTORY",
        { sender_id: data.sender_id },
        { $set: failureData },
        { upsert: true }
      );

      return {
        success: false,
        message: "Transaction failed: " + error.message,
      };
    }
  },
};
