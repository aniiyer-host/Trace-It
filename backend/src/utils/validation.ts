import Joi from 'joi';

export const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  fullName: Joi.string().optional(),
  phone: Joi.string().optional(),
}).unknown(false);

export const verifyEmailSchema = Joi.object({
  email: Joi.string().email().required(),
  otpCode: Joi.string().length(6).required(),
}).unknown(false);

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
}).unknown(false);