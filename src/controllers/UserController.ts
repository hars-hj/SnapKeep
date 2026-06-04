import dotenv from 'dotenv';
import { Request, Response } from "express";
import mongoose from "mongoose";
import {User} from '../models/userModel.js'
import bcrypt from 'bcryptjs';

type Params = { id: string };

//get all users
async function GetAllUsers ( req: Request,res: Response){
     try{
        const users = await User.find({});
        res.status(200).json(users);
     }catch(err){ 
        console.error("error fetching users",err);
         res.status(500).json({message:"server error"});
     }
};


//get a single user using id
async function GetUserProfile (req: Request<Params>,res: Response){
   
    try{
         const { id } = req.params;


        if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid user id" });
        }

        const user = await User.findById(id);

        if (!user) {
        return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({user,message:"user fetched"});
        }catch(err){
            console.error("error fetching users",err);
            res.status(500).json({message:"server error"});
    }
};


//edit user
async function EditUserProfile (req: Request<Params>,res: Response){
    try{
        const { id } = req.params;
        const { email, password } = req.body;

        let updatelist: {
        email?: string;
        passwordHash?: string;
        } = {};

        if (email) {
        updatelist.email = email;
        }

        if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
            updatelist.passwordHash = hashedPassword;
        }

        const updatedUser = await User.findByIdAndUpdate(
            id,
            updatelist,
            { new: true }
            );
           res.status(201).json({message:"user updated successfully",updatedUser});
         }catch(err){
            console.error("error updating user",err);
            res.status(500).json({message:"server error"});
        }
};


// delete user
async function DeleteUserProfile(req: Request<Params>,res: Response){
     try{
         const { id } = req.params; 

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    await User.findByIdAndDelete(id);

    return res.status(200).json({message:"user Deleted successfully"});
     }catch(err){
        console.error("error fetching users",err);
         res.status(500).json({message:"server error"});
     }
};

export{GetAllUsers,EditUserProfile,DeleteUserProfile,GetUserProfile};