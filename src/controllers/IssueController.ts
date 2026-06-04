import { Request, Response } from "express";
import mongoose from "mongoose";
import {Issue} from '../models/issueModel.js'
import {Repository} from '../models/repoModel.js'
import {Types} from 'mongoose';

type params = {id:string};
type updateissue = {
    title?:string,
    description?:string,
    status?:string
}
async function CreateIssue(req: Request,res: Response){

    try{
         const {title,description,status,repository}=req.body;
         const repositoryId = new Types.ObjectId(repository);
     if (!mongoose.Types.ObjectId.isValid(repository)) {
            return res.status(400).json({ message: "Invalid reposetory ID" });
            }

    // ensure repository exists (any logged-in user may open an issue)
    const repo = await Repository.findById(repository);
    if (!repo) {
      return res.status(404).json({ message: "Repository not found" });
    }
    // req.user comes from requireAuth middleware
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const newIssue = new Issue({
        title,
        description,
        status,
        repository,
        owner: userId,   // set owner
    });

    const issue  = await newIssue.save();

    // add issue reference to repo
    await Repository.findByIdAndUpdate(repository, { $push: { issues: issue._id } });

    res.status(201).json({message:"issue created successfully",issue});
    } catch(err){
        console.error("error creating issue",err);
        res.status(500).json({message:"server error"});
    }
   
};

async function UpdateIssue(req: Request<params>,res: Response){
    try{
         const {id}=req.params;
         const{title,description,status} = req.body;

         // ensure owner
         const userId = (req as any).user?.id;
         const existing = await Issue.findById(id);
         if (!existing) return res.status(404).json({message:"Issue not found"});
         if (!userId || existing.owner.toString() !== userId) {
           return res.status(403).json({message:"Only issue owner may update"});
         }

         let updateissuelist:updateissue={};
         if(title) updateissuelist.title = title;
         if(description) updateissuelist.description = description;
         if(status) updateissuelist.status = status;


         const issue = await Issue.findByIdAndUpdate({_id:id,updateissuelist});
         res.status(200).json({message:"issue updated successfully",issue});
    } catch(err){
        console.error("error fetching  issue by id",err);
        res.status(500).json({message:"server error"});
    }
};

async function DeleteIssue (req: Request,res: Response){
    try{
         const {id}=req.params;
         const userId = (req as any).user?.id;
         const existing = await Issue.findById(id);
         if (!existing) return res.status(404).json({message:"Issue not found"});
         if (!userId || existing.owner.toString() !== userId) {
           return res.status(403).json({message:"Only issue owner may delete"});
         }
         const issue = await Issue.findByIdAndDelete({_id:id});
        // also remove from repository
        if (issue) {
          await Repository.findByIdAndUpdate(issue.repository, { $pull: { issues: issue._id } });
        }
        res.status(200).json({message:"issue deleted successfully"});
    } catch(err){
        console.error("error fetching  issue by id",err);
        res.status(500).json({message:"server error"});
    }
};

async function FetchAllIssue (req: Request,res: Response){
      try{
       
         const issues = await Issue.find({}).populate('owner', 'username');
         res.status(200).json({issues});
    } catch(err){
        console.error("error fetching all issues",err);
        res.status(500).json({message:"server error"});
    }
};

async function FetchIssue  (req: Request<params>,res: Response){
      try{
         const {id}=req.params;
         const issue = await Issue.find({_id:id}).populate('owner', 'username');
         res.status(200).json({issue});
    } catch(err){
        console.error("error fetching  issue by id",err);
        res.status(500).json({message:"server error"});
    }
};



async function FetchIssuesForRepo(req: Request<params>, res: Response) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid repo id" });
    }
    const issues = await Issue.find({ repository: id }).populate('owner', 'username');
    res.status(200).json({ issues });
  } catch (err) {
    console.error("error fetching issues for repo", err);
    res.status(500).json({ message: "server error" });
  }
}

export {CreateIssue,UpdateIssue,DeleteIssue,FetchAllIssue,FetchIssue,FetchIssuesForRepo};