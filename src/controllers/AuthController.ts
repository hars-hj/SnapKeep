import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js"; // adjust path

type SignupBody = {
  username: string;
  email: string;
  password: string;
};

type LoginBody = {
  email: string;
  password: string;
};

 const Signup = async (
  req: Request<{}, {}, SignupBody>,
  res: Response
) => {
  try {
    const { username, email, password } = req.body;

    if (!username?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: "username, email, password required" });
    }

    // check duplicates (email or username)
    const existing = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
    });

    if (existing) {
      return res.status(409).json({ message: "Username or email already in use" });
    }
      
    const passwordHash = await bcrypt.hash(password, 10);

    //create user in db
    const user = await User.create({
      username,
      email: email.toLowerCase(),
      passwordHash,
      repositories: [],
      starredRepositories: [],
      following: [],
    });

    // signing jwt token
    const token = jwt.sign(
      { id: user._id.toString() },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );
    
    //sending cookie
    res.cookie("token", token, {
      httpOnly: true,
       sameSite: 'lax',
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      message: "Signup successful",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err: any) {
    // handle mongo duplicate key just in case race condition
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Username or email already in use" });
    }
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};


 //////////login////////////


 const Login = async (
  req: Request<{}, {}, LoginBody>,
  res: Response
) => {
    
  try {
  
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required",
      });
    }

    // passwordHash is select:false → must explicitly select it
    const user = await User.findOne({ email })
      .select("+passwordHash");
    
      //chrck id user exist
    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }
     // check is the password matches.
    const isMatch = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }
    // sign jwt token.
    const token = jwt.sign(
      { id: user._id.toString() },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
       sameSite: 'lax',
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

 const Logout = (req: Request, res: Response): void => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });

  res.status(200).json({ message: "Logged out successfully" });
};

export{Signup,Login,Logout};