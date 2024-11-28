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
  redis_set_with_expiration,
  store_billers_in_redis,
  redisGetAll,
  redisGet,
  store_categories_in_redis,
  redisGetFromHash,
  get_categories,
} = require("../../helpers/redisFunctions");
router.post("/data", async (req, res) => {
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

//function for expiration

function is_token_expired(token) {
  const tokenData = parseJwt(token);
  const currentTime = Math.floor(Date.now() / 1000);
  return tokenData.exp < currentTime;
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
    stored_token,
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

    const response = await api.get("/billers/UBXPC");
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
      // timeout: 5000,
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
async function create_payment(
  biller_code,
  client_reference,
  validation_number
) {
  try {
    // const request_body = {
    //   clientReference: client_reference,
    //   validationNumber: validation_number,
    // };

    const request_body = {
      clientReference: functions.generate_reference_number("E0GG"),
      validationNumber: "d529a73d-0c96-4a86-865f-d133daaba732",
    };

    console.log(request_body);
    const get_token = await api_token();

    const api = axios.create({
      baseURL: "https://stg.bc-api.bayad.com/v3",
      headers: {
        Authorization: `Bearer ${get_token}`,
        "Content-Type": "application/json",
      },
      // timeout: 5000,
    });
    console.log(api);

    const response = await api.post(
      `/billers/${biller_code}/payments`,
      request_body
    );
    console.log(response, "errror");

    if (response.status === 200 && response.data.status === "Pending") {
      console.log("Payment successfully created. Transaction is queued.");
      return response.data;
    } else {
      console.error("Failed to create payment", response.data);
      return null;
    }
  } catch (error) {
    console.error("Error occurred while calling Create Payment API:", error);
    return null;
  }
}
//request to inquire payment
async function inquire_payment(biller_code, validation_number) {
  try {
    const get_token = await api_token();

    if (!get_token) {
      console.error("Unable to fetch API token.");
      return null;
    }

    const api = axios.create({
      baseURL: "https://stg.bc-api.bayad.com/v3",
      headers: {
        Authorization: `Bearer ${get_token}`,
        "Content-Type": "application/json",
      },
    });

    const response = await api.post(
      `/billers/${biller_code}/payments/${validation_number}`
    );
    if (response.status === 200) {
      console.log("Payment Inquiry Response:", response.data);
      return response.data;
    } else {
      console.error("Failed to inquire payment:", response.data);
      return null;
    }
  } catch (error) {
    if (error.response) {
      console.error("Error occurred during Inquire Payment API call:");
      console.error("Status:", error.response.status);
      console.error("Response Data:", error.response.data);
      console.error("Response Headers:", error.response.headers);
    } else if (error.request) {
      console.error("No response received from Inquire Payment API.");
    } else {
      console.error("Error:", error.message);
    }
    return null;
  }
}

//route to get categories
router.post("/get_categories", async (req, res) => {
  try {
    const get_token = await api_token();

    // const api = axios.create({
    //   baseURL: "https://stg.bc-api.bayad.com/v3",
    //   headers: {
    //     Authorization: `Bearer ${get_token}`,
    //     "Content-Type": "application/json",
    //   },
    //   timeout: 5000,
    // });
    let response = await get_categories("categories");
    console.log(response);

    // if (data) {
    //   console.log("fetched from redis");
    //   return res
    //     .status(200)
    //     .send({ success: true, categories: JSON.parse(data) });
    // } else {
    // const response = await api.get("/billers?categoriesOnly=true");

    // await store_categories_in_redis(response.data);

    return res.status(200).json({
      success: true,
      categories: response,
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      details: error.message,
    });
  }
});

//route to get billers by category

router.post("/get_billers_by_category", async (req, res) => {
  try {
    var { value, error } = validations.get_biller_by_category(req.body);
    if (error) return res.status(400).send(error.details[0].message);
    let data = value;
    const get_token = await api_token();

    // const api = axios.create({
    //   baseURL: "https://stg.bc-api.bayad.com/v3",
    //   headers: {
    //     Authorization: `Bearer ${get_token}`,
    //     "Content-Type": "application/json",
    //   },
    //   timeout: 5000,
    // });

    // const response = await api.get(`/billers?category=${data.category}`);
    const category = await redisGetFromHash("categories", data.category);

    return res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      details: error.message,
    });
  }
});

//route to get all billers
router.post("/get_all_billers", async (req, res) => {
  try {
    const get_token = await api_token();

    // let data = await mongoFunctions.find("STATS");
    // console.log(data);
    const api = axios.create({
      baseURL: "https://stg.bc-api.bayad.com/v3",
      headers: {
        Authorization: `Bearer ${get_token}`,
        "Content-Type": "application/json",
      },
    });

    const categoriesResponse = await api.get("/billers");

    return res
      .status(200)
      .json({ success: true, billers: categoriesResponse.data });
  } catch (error) {
    console.error("Error:", error.message);

    // Return error response
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      details: error.message,
    });
  }
});

//route to get biller by biller id
router.post("/get_biller_by_id", async (req, res) => {
  try {
    var { value, error } = validations.get_biller_by_id(req.body);
    if (error) return res.status(400).send(error.details[0].message);
    let data = value;

    const get_token = await api_token();

    // const api = axios.create({
    //   baseURL: "https://stg.bc-api.bayad.com/v3",
    //   headers: {
    //     Authorization: `Bearer ${get_token}`,
    //     "Content-Type": "application/json",
    //   },
    //   timeout: 5000,
    // });

    // const response = await api.get(`/billers/${data.biller_id}`);
    let findId = await mongoFunctions.find_one("STATS", {
      biller_id: data.biller_id,
    });
    if (!findId) {
      return res.status(400).send("Biller Not Found");
    }
    return res.status(200).json({ success: true, biller_details: findId });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      details: error.message,
    });
  }
});

//route to verify account
router.post("/verify_account", async (req, res) => {
  var { value, error } = validations.verify_account(req.body);
  if (error) return res.status(400).send(error.details[0].message);
  let data = value;
  let other_charges;
  if (data.other_charges !== "NONE") {
    other_charges = data.other_charges;
  } else {
    const token = await api_token();
    // return res.send(token);
    console.log(token, "token");

    if (!token) {
      return res.status(401).json({ message: "Failed to fetch API token" });
    }

    const config = {
      method: "get",
      maxBodyLength: Infinity,
      url: `https://stg.bc-api.bayad.com/v3/billers/${data.biller_code}/fees?amount=${data.amount}`,
      headers: {
        Authorization: token,
      },
    };

    const other_chargesR = await axios(config);
    other_charges = other_chargesR.data.data.otherCharges;
  }
  console.log("other_charges-------------", other_charges);
  try {
    const result = await verify_account(
      data.biller_code,
      data.account_number,
      data.amount,
      other_charges
    );
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: "An unexpected error occurred.",
      message: error.message,
    });
  }
});

//route to create payment
router.post("/create_payment", async (req, res) => {
  var { value, error } = validations.create_payment(req.body);
  if (error) return res.status(400).send(error.details[0].message);
  let dataa = value;
  const token = await api_token();

  const clientReference = await functions.generate_reference_number("E0GG");
  const validationNumber = dataa.validation_number;

  const data = {
    clientReference,
    validationNumber,
  };

  console.log(data, "data");

  const config = {
    method: "post",
    maxBodyLength: Infinity,
    url: "https://stg.bc-api.bayad.com/v3/billers/MECOR/payments",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data,
  };

  try {
    const createPayamount = await axios(config);
    console.log(createPayamount.data);

    transactions_data = {};

    return res.status(200).send(createPayamount.data);
  } catch (error) {
    console.error(
      "Error response:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .send(
        error.response ? error.response.data.details.message : "Error occurred"
      );
  }
});

//route to inquire payment

router.post("/inquire_payment", async (req, res) => {
  try {
    const { biller_code, validation_number } = req.body;

    if (!biller_code || !validation_number) {
      return res.status(400).json({
        success: false,
        message: "Biller code and validation number are required",
      });
    }

    try {
      const result = await inquire_payment(biller_code, validation_number);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: "An unexpected error occurred.",
        message: error.message,
      });
    }
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

//get other charges

router.post("/get_other_charges", async (req, res) => {
  // Fetch API token
  const token = await api_token();
  // return res.send(token);
  console.log(token, "token");

  if (!token) {
    return res.status(401).json({ message: "Failed to fetch API token" });
  }

  var config = {
    method: "get",
    maxBodyLength: Infinity,
    url: `https://stg.bc-api.bayad.com/v3/billers/UBXPC/fees`,
    headers: {
      Authorization: token,
    },
  };
  try {
    var payload = {
      code: "!@#$",
      otherCharges: "amount requred",
    };
    const otherCharges = await axios(config);
    console.log(otherCharges.data, "dssdsdasda");
    return res.status(200).send(otherCharges.data);
  } catch (error) {
    console.log(error.response.data.details.message);
    console.log(payload);
    return res.status(400).send(error);
  }
});

module.exports = { router, api_token };
// module.exports = api_token;
// module.exports = router;
