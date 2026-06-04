import express from 'express';
import {Signup,Login,Logout} from '../controllers/AuthController.js'
import { requireAuth, AuthRequest } from "../middleware/authMiddleware.js";
import {User} from "../models/userModel.js";
const authRouter = express.Router();

  authRouter.post('/logout',Logout);
  authRouter.post('/login',Login);
  authRouter.post('/signup',Signup);
  


authRouter.get("/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.user!.id)
      .select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

export default authRouter;