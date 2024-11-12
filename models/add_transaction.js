const mongoose = require("mongoose");

const transaction_schema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },

    t_id: {
      type: String,
    },
    sender: {
      type: String,
    },
    receiver: {
      type: String,
    },
    status: {
      type: String,
    },
    coin: {
      type: String,
    },
    amount: {
      type: Number,
      get: (value) => value.toFixed(8),
    },
    payment_type: {
      type: String,
    },
    transaction_fee: {
      type: Number,
    },
  },
  { timestamps: true }
);

transaction_schema.index({ user_id: 1, transaction_id: 1 });

const HISTORY = mongoose.model("HISTORY", transaction_schema);

module.exports = HISTORY;
