const Joi = require("joi");
const moment = require("moment");

// Define schema for login employee
function user_register(data) {
  const schema = Joi.object({
    email: Joi.string().required().max(55),
    password: Joi.string().required().min(5).max(15),
    username: Joi.string().required().min(8).max(15),
    balance: Joi.number().required(),
  });
  return schema.validate(data);
}
function payment(data) {
  const schema = Joi.object({
    // sender_user_id: Joi.string().required(),
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
function user_login(data) {
  const schema = Joi.object({
    email: Joi.string().required(),
    password: Joi.string().required(),
  });
  return schema.validate(data);
}

function login(data) {
  const schema = Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required(),
    tpa_id: Joi.string().required(),
    grant_type: Joi.string().required(),
    scope: Joi.string().required(),
  });
  return schema.validate(data);
}

function add_data(data) {
  const schema = Joi.object({
    name: Joi.string().required().lowercase(),
    bic: Joi.string().required(),
    length_of_transfaree_account_no: Joi.string().required().lowercase(),
  });
  return schema.validate(data);
}

module.exports = {
  user_register,
  payment,
  get_payment,
  user_login,
  login,
  add_data,
};
