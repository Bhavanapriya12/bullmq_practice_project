const express = require("express");
const payment = require("../routes/payment_routes/payment");
const billers = require("../routes/payment_routes/billers");

const queue = require("express-queue");

module.exports = (app) => {
  // Middleware setup
  app.use(express.json());

  // Route handlers
  app.get("/", async (req, res) => {
    return res.status(200).send("Hello, Welcome to CRM Home 🚀");
  });

  // API routes
  app.use(
    "/payment",
    payment,
    queue({
      activeLimit: 1,
      queuedLimit: -1,
    })
  );
  app.use(
    "/billers",
    billers,
    queue({
      activeLimit: 1,
      queuedLimit: -1,
    })
  );
};
