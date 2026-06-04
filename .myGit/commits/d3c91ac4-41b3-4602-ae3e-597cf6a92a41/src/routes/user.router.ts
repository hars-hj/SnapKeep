import express from 'express';

import {GetAllUsers,EditUserProfile,DeleteUserProfile,GetUserProfile} from '../controllers/UserController.js'
const userRouter = express.Router();

userRouter.get('/getallusers',GetAllUsers);
userRouter.put('/edituserprofile/:id',EditUserProfile);
userRouter.delete('/deleteuserprofile/:id',DeleteUserProfile);
userRouter.get('/userprofile/:id',GetUserProfile);



export default userRouter;