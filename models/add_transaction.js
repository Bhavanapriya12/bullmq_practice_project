const mongoose = require("mongoose");

const transaction_schema = new mongoose.Schema(
  {
    sender_id: { type: String, required: true, index: true },

    amount: {
      type: String,
    },
    biller_id: {
      type: String,
    },
    transaction_id: {
      type: String,
    },
    reference_number: {
      type: String,
    },
    payment_method: {
      type: String,
    },
    client_reference: {
      type: String,
    },
    payment_status: {
      type: String,
    },
    other_charges: {
      type: String,
    },
    total_amount: {
      type: Number,
    },
  },
  { timestamps: true }
);

transaction_schema.index({ user_id: 1, transaction_id: 1 });

const HISTORY = mongoose.model("HISTORY", transaction_schema);

module.exports = HISTORY;
