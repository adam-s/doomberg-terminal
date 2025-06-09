import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { type Router } from 'express';
import { z } from 'zod';

import { createApiResponse } from '@src/api-docs/openAPIResponseBuilders';
import { GetUserSchema, UserSchema } from '@src/data-layer/user/user.model';
import { validateRequest } from '@src/common/utils/httpHandlers';
import { userController } from './user.controller';

export const userRegistry = new OpenAPIRegistry();
export const userRouter: Router = express.Router();

userRegistry.register('User', UserSchema);

userRegistry.registerPath({
  method: 'get',
  path: '/users',
  tags: ['User'],
  responses: createApiResponse(z.array(UserSchema), 'Success'),
});

userRouter.get('/', userController.getUsers);

userRegistry.registerPath({
  method: 'get',
  path: '/users/{id}',
  tags: ['User'],
  request: { params: GetUserSchema.shape.params },
  responses: createApiResponse(UserSchema, 'Success'),
});

userRouter.get('/:id', validateRequest(GetUserSchema), userController.getUser);
