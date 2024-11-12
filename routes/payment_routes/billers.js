const express = require("express");
const mongoFunctions = require("../../helpers/mongoFunctions");
const router = express.Router();
const validations = require("../../helpers/schema");
const functions = require("../../helpers/functions");
const queue_job = require("../../helpers/producer");
const worker = require("../../helpers/consumer");
const { Auth } = require("../../middlewares/auth");
const bcrypt = require("../../helpers/hash");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const XLSX = require("xlsx");
const axios = require("axios");
const {
  update_redis,
  genOtp,
  redisGetSingle,
} = require("../../helpers/redisFunctions");
router.post("/data", async (req, res) => {
  // console.log(data);
  //validate data
  var { value, error } = validations.add_data(req.body);
  if (error) return res.status(400).send(error.details[0].message);
  let data = value;

  data_xl = {
    name: data.name,
    bic: data.bic,
    length_of_transferee_account_no: data.length_of_transfaree_account_no,
  };
  const data_add = await mongoFunctions.find_one_and_update(
    "DATA",
    { user_id: "12345" },
    {
      $push: { data: data_xl },
    }
  );
  console.log(data_add);
  if (!data_add) {
    return res.status(400).send("Failed To Add Data.");
  }
  return res.status(200).send({
    success: "Data Added Successfully..!!",
  });
});

router.post("/get_data", async (req, res) => {
  let data = await mongoFunctions.find_one("DATA", { user_id: "12345" });
  console.log(data);
  data.data.map((e) => {
    e.name = e.name.toUpperCase();
    e.min = eval(e.min);
    e.max = eval(e.max);
    return e;
  });
  console.log(data);
  return res.status(200).send(data);
});

const upload = multer({ dest: "uploads/" });
router.post("/add_data_from_xl", upload.single("Data"), async (req, res) => {
  try {
    console.log("Uploaded file:", req.file.filename);

    if (!req.file) {
      return res.status(400).send("No File Uploaded.");
    }
    console.log(req.file);

    const workbook = XLSX.readFile(req.file.path);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    console.log(jsonData);
    console.log("jsondata[0]------------", jsonData[0]);
    console.log("jsondata[1]----------------", jsonData[1]);

    // for (const data of jsonData) {

    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      console.log("row=------>", row);

      const data_xl = {
        name: row["__EMPTY_1"],
      };
      console.log(data_xl);
      const data_add = await mongoFunctions.find_one_and_update(
        "DATA",
        { user_id: "12345" },
        {
          $push: { data: data_xl },
        }
      );
      console.log(data_add);
      if (!data_add) {
        return res.status(400).send("Failed To Add Data.");
      }
    }

    return res.status(200).send({
      success: "Data Added Successfully..!!",
    });
  } catch (error) {
    console.error("Error adding data from Excel:", error);
    res.status(500).send("Internal Server Error");
  }
});

//authentication token

// const api_token =
//   "eyJraWQiOiJraWoydFFERTZiSWxnOFE3enZMSmFZaE5jNXdlWHRzaVM0OW1vYVR4YWs0PSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiIzNmRkbHRubG1rbXFrbWJ1M2E4MXRwNnBrbSIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoibWVjb20tYXV0aFwvYWxsIiwiYXV0aF90aW1lIjoxNzMxMzAyODU3LCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuYXAtc291dGhlYXN0LTEuYW1hem9uYXdzLmNvbVwvYXAtc291dGhlYXN0LTFfWmZCalVlU3kzIiwiZXhwIjoxNzMxMzA2NDU3LCJpYXQiOjE3MzEzMDI4NTcsInZlcnNpb24iOjIsImp0aSI6IjEzNTY4MGJiLTAwYWUtNGFkZC05NzI0LTY0ZmYyZTQ0OTgyNCIsImNsaWVudF9pZCI6IjM2ZGRsdG5sbWttcWttYnUzYTgxdHA2cGttIn0.FpFhNgauegikL92lZ-3kvs49azetzdL3qUCkY_-nPXN-wyPOCxaN4VgWJrcKbn79eDHGaMbG8ZscPTS-e45kp_b-Nwsydc37knIBw6vY07e_uroMuRXPosr_S7rLWHV840vXyOMzcGW_4D_nRcWHw2kIrVmBYtY4v9Fj8MnfCe7QQ-vkzORFgvN4Qt2dadLHtdNvikidBYeXBBLRmQY2F7uOQVdv-gsWaZ7LBG32rRYy7D_BNKEl-q7bdcdayyJwJebkIjea_AOtx7eKxlzxcA202fhO8r1c8QQInAk_TkNuQrHq9SYFlTrd6STy87z_RcG2Ik204L3CaZVpMATGzw";

//request to get auth token

async function api_token() {
  // const stored_token = await redisGetSingle("bayad_api_token");

  // if (stored_token) {
  //   console.log("Using stored token");
  //   return stored_token;
  // }

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
    // await ("bayad_api_token", 3600, token);

    console.log("Generated Token:", token);
    return token;
  } catch (error) {
    console.error("Error generating token:", error.message || error);
    throw error;
  }
}

// request to get  billers
const get_billers = async () => {
  let get_token = await api_token();

  const api = axios.create({
    baseURL: "https://stg.bc-api.bayad.com/v3",
    headers: {
      Authorization: `Bearer ${get_token}`,
      "Content-Type": "application/json",
    },
    timeout: 5000,
  });

  try {
    const response = await api.get("/billers");
    console.log("Billers:", response.data);
  } catch (error) {
    if (error.response) {
      console.error("Error fetching billers:", error.response.status);
      console.error("Error message:", error.response.data);
    } else {
      console.error("Error:", error.message);
    }
  }
};

// request to get single biller details

const get_biller_details = async () => {
  try {
    const get_token = await api_token();
    console.log("billers details token----------->", get_token);

    const api = axios.create({
      baseURL: "https://stg.bc-api.bayad.com/v3",
      headers: {
        Authorization: `Bearer ${get_token}`,
        "Content-Type": "application/json",
      },
      // timeout: 5000,
    });

    const response = await api.get("/billers/MECOR");
    console.log("Biller Details:", response.data);
  } catch (error) {
    if (error.response) {
      console.error("Error fetching biller details:", error.response.status);
      console.error("Error message:", error.response.data);
    } else {
      console.error("Error:", error.message);
    }
  }
};

//request to verify account

const verify_account = async (
  biller_code,
  account_number,
  amount,
  other_charges
) => {
  try {
    const get_token = await api_token();

    const api = axios.create({
      baseURL: "https://stg.bc-api.bayad.com/v3",
      headers: {
        Authorization: `Bearer ${get_token}`,
        "Content-Type": "application/json",
      },
      timeout: 5000,
    });

    const request_body = {
      paymentMethod: "CASH",
      amount: amount,
      otherCharges: other_charges,
    };

    const response = await api.post(
      `/billers/${biller_code}/accounts/${account_number}`,
      request_body
    );

    console.log("Account Verification Response:", response.data);

    return response.data;
  } catch (error) {
    if (error.response) {
      console.error(
        "Error fetching account verification:",
        error.response.status
      );
      console.error("Error message:", error.response.data);
    } else {
      console.error("Error:", error.message);
    }

    throw error;
  }
};

//request to create payment



get_billers();
get_biller_details();
verify_account("MECOR", "0136173373", 23, 0.00);

//request to initiate payment

module.exports = router;
