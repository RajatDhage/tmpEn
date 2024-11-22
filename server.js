import express from 'express';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import Action from './event.js';
import Company from './company.js';

dotenv.config();

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGOOSE_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
mongoose.connection.on('connected', () => {
    console.log('Connected to MongoDB');
});


// Regex patterns
let emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
let passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,20}$/;

const formatDatatoSend = (user) => {
    const access_token = jwt.sign({ email: user.email }, process.env.SECRET_ACCESS_KEY);
    return {
        access_token,
        companyname:user.companyname,
        email: user.email,
    };
};
const getAnalytics = async (req, res) => {
    try {
        const actionsByType = await Action.aggregate([
            { $group: { _id: "$actionType", count: { $sum: 1 } } },
        ]);

        const actionsOverTime = await Action.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        const mostActivePages = await Action.aggregate([
            { $group: { _id: "$pageUrl", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        res.status(200).json({ actionsByType, actionsOverTime, mostActivePages });
    } catch (error) {
        res.status(500).json({ message: "Error fetching analytics", error });
    }
};
app.post('/', async (req, res) => {
    console.log(req.body)
    const { actionType, pageUrl, metadata } = req.body;

    try {
        const existingAction = await Action.findOne({ actionType, pageUrl });

        if (existingAction) {
            existingAction.counter += 1;
            existingAction.timestamp = new Date();
            await existingAction.save();
            res.status(200).json({ message: 'Action updated successfully', action: existingAction });
        } else {
            const newAction = new Action({  actionType, pageUrl, metadata, counter: 1, timestamp: new Date() });
            await newAction.save();
            res.status(201).json({ message: 'Action created successfully', action: newAction });
        }
    } catch (error) {
        console.error('Error tracking action:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

app.post('/signup', async (req, res) => {
    const { name, email, password, companyname } = req.body; // Add companyname here

    // Validate companyname
    if (!companyname) {
        return res.status(400).json({ error: 'Company name is required' });
    }

    // Validate name
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }

    // Validate email
    if (!email) {
        return res.status(400).json({ error: 'Enter the email' });
    }
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Email is invalid' });
    }

    // Validate password
    if (!password) {
        return res.status(400).json({ error: 'Enter the password' });
    }
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ error: 'Password should be 6 to 20 characters long with a numeric, 1 lowercase, and 1 uppercase' });
    }

    try {
        // Hash the password
        const hashed_password = await bcrypt.hash(password, 10);

        // Create user with companyname
        const user = new Company({
            name,
            email,
            password: hashed_password,
            companyname // Make sure this field is included
        });

        const savedUser = await user.save();  // Save the user in the database
        res.status(200).json({ message: 'User registered successfully', user: savedUser });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});



app.post('/signin', async (req, res) => {
    const { email, password } = req.body;
  
    try {
      // Check if user exists
      const user = await Company.findOne({ email }); // Use Company model here
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
  
      // Generate JWT
      const token = jwt.sign({ id: user._id }, process.env.SECRET_ACCESS_KEY, {
        expiresIn: '1h',
      });
  
      // Respond with user data and token
      res.status(200).json({
        message: 'Login successful',
        token,
        user: { id: user._id, email: user.email, companyname: user.companyname },
      });
    } catch (error) {
      console.error('Signin error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  



app.get("/", (req, res)=>{
    res.send("Hi, this is root page");
})

app.listen(3000, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
