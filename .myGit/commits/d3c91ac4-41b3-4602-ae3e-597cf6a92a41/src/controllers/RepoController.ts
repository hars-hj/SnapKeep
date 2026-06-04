import { Request, Response } from "express";
import mongoose from "mongoose";
import {User} from '../models/userModel.js'
import {Issue} from '../models/issueModel.js'
import {Repository} from '../models/repoModel.js'

type Params = { id: string,name:string,userId:string };
// create reposetory
async function CreateReposetory  (req: Request,res: Response){
    try{
        const {owner,name,issues,content,description,visibility} = req.body;
        if(!name){
            res.status(400).json({message:"reposetory name required"});
        }

        if (!mongoose.Types.ObjectId.isValid(owner)) {
        return res.status(400).json({ message: "Invalid user id" });
        }

        const newReposetory = new Repository({
            name,
            description,
            content,
            visibility,
            owner,
            issues
        });

        const result = await newReposetory.save();

        res.status(201).json({
            message:"reposetory created",
            reposetoryId : result._id
        })
        
    }catch(err){
        console.error("error creating reposetory",err);
         res.status(500).json({message:"server error"});
    }
};

//fetch all reposetory
async function fetchAllReposetory (req: Request,res: Response){
       try{
              const repositories = await Repository.find({})
              .populate("owner")
              .populate({ path: "issues", populate: { path: "owner", select: "username _id" } });

              res.status(200).json(repositories);
           }catch(err){ 
              console.error("error fetching reposetories",err);
               res.status(500).json({message:"server error"});
         }
};


//fetch reposetory bu id
async function fetchReposetoryById  (req: Request<Params>,res: Response){
    const{id}=req.params;
         try{
            if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid reposetory id" });
            }

            const repository = await Repository.find({_id:id})
             .populate("owner")
            .populate({ path: "issues", populate: { path: "owner", select: "username _id" } });

            res.status(200).json(repository);
           }catch(err){ 
              console.error("error fetching reposetory",err);
               res.status(500).json({message:"server error"});
         }
};


// fetch repo by name

 const fetchReposetoryByName = async (
  req: Request<Params>,
  res: Response
) => {
  try {
    const { name } = req.params;

    const repository = await Repository.findOne({ name })
      .populate("owner", "username email"); // or just "username"

    if (!repository) {
      return res.status(404).json({ message: "Repository not found" });
    }

    return res.status(200).json(repository);
  } catch (err) {
    console.error("error fetching repository", err);
    return res.status(500).json({ message: "server error" });
  }
};

// get all repso for current user
const fetchReposetoryForCurrentUser = async (
  req: Request<Params>,
  res: Response
) => {
  try {
    const { userId } = req.params;

    const repos = await Repository.find({ owner: userId })
      .populate("owner");

    return res.status(200).json(repos);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "server error" });
  }
};

 const UpdateReposetoryById = async (
  req: Request<Params>,
  res: Response
) => {
  try {
    const { id } = req.params;
    const { name, description, content, visibility } = req.body;

    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid repository id" });
    }

    // build update object dynamically
    const updateData: {
      name?: string;
      description?: string;
      content?: string;
      visibility?: string;
    } = {};

    if (name) updateData.name = name;
    if (description) updateData.description = description;
    if (content) updateData.content = content;
    if (visibility) updateData.visibility = visibility;

    const updatedRepo = await Repository.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("owner", "username")
      .populate("issues");

    if (!updatedRepo) {
      return res.status(404).json({ message: "Repository not found" });
    }

    return res.status(200).json(updatedRepo);
  } catch (err) {
    console.error("error updating repository", err);
    return res.status(500).json({ message: "server error" });
  }
};

// toggle visibility
const VisibilityToggle = async (req: Request<Params>, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid repository id" });
    }

    const repo = await Repository.findById(id);
    if (!repo) {
      return res.status(404).json({ message: "Repository not found" });
    }

    repo.visibility = repo.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC";
    await repo.save();

    const populated = await Repository.findById(repo._id)
      .populate("owner", "username email")
      .populate("issues");

    return res.status(200).json(populated);
  } catch (err) {
    console.error("error toggling visibility", err);
    return res.status(500).json({ message: "server error" });
  }
};

// delete by id
const DeleteReposetoryById = async (req: Request<Params>, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid repository id" });
    }

    const repo = await Repository.findById(id);
    if (!repo) {
      return res.status(404).json({ message: "Repository not found" });
    }

    await Issue.deleteMany({ repository: repo._id });

    await User.updateOne(
      { _id: repo.owner },
      { $pull: { repositories: repo._id } }
    );

    await Repository.deleteOne({ _id: repo._id });

    return res.status(200).json({ message: "Repository deleted" });
  } catch (err) {
    console.error("error deleting repository", err);
    return res.status(500).json({ message: "server error" });
  }
};

// fetch all issues for a given repository
const FetchIssuesForRepo = async (req: Request<Params>, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid repository id" });
    }
    const issues = await Issue.find({ repository: id }).populate('owner', 'username');
    return res.status(200).json({ issues });
  } catch (err) {
    console.error("error fetching issues for repo", err);
    return res.status(500).json({ message: "server error" });
  }
};

export{CreateReposetory,VisibilityToggle,fetchAllReposetory,fetchReposetoryById,fetchReposetoryByName,fetchReposetoryForCurrentUser,UpdateReposetoryById,DeleteReposetoryById,FetchIssuesForRepo};