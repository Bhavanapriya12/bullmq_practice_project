const Joi = require("joi");
const moment = require("moment");

// Define schema for login employee
function user_register(data) {
  const schema = Joi.object({
    email: Joi.string().required().max(55),
    username: Joi.string().required().min(8).max(15),
    balance: Joi.number().required(),
  });
  return schema.validate(data);
}
function payment(data) {
  const schema = Joi.object({
    sender_user_id: Joi.string().required(),
    receiver_user_id: Joi.string().required(),
    coin: Joi.string().required(),
    balance: Joi.number().required(),
  });
  return schema.validate(data);
}
function get_payment(data) {
  const schema = Joi.object({
    id: Joi.string().required(),
  });
  return schema.validate(data);
}

module.exports = { user_register, payment, get_payment };
