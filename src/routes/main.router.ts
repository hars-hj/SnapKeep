import express from 'express';
import userRouter from './user.router.js';
import repoRouter from './repo.router.js';
import issueRouter from './issue.router.js';
import authRouter from './auth.router.js';
const mainRouter = express.Router();

mainRouter.use('/api/users',userRouter);
mainRouter.use('/api/repos',repoRouter);
mainRouter.use('/api/issues',issueRouter);
mainRouter.use('/api',authRouter);


mainRouter.get('/',(req,res)=>{
      console.log('route active');
});

export default mainRouter;