const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

dotenv.config();
console.log(numCPUs);
// MongoDB Schema
const RequestSchema = new mongoose.Schema({
    reqId: { type: Number, required: true },
    timestamp: { type: Date, required: true },
    processTime: { type: Number, required: true }, // Time taken to process in ms
    serverInstance: { type: String, required: true }
});

const Request = mongoose.model('Request', RequestSchema);

// Counter for tracking reqId
let requestCounter = 0;

// Function to get next reqId atomically
async function getNextRequestId() {
    const counter = await mongoose.connection.collection('counters').findOneAndUpdate(
        { _id: 'reqId' },
        { $inc: { sequence_value: 1 } },
        { upsert: true, returnDocument: 'after' }
    );
    return counter.value?.sequence_value || 0;
}

// Performance monitoring
const metrics = {
    totalRequests: 0,
    failedRequests: 0,
    avgProcessingTime: 0,
    maxProcessingTime: 0,
    concurrentRequests: 0
};

if (cluster.isMaster) {
    console.log(`Master process ${process.pid} is running`);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        // Replace the dead worker
        cluster.fork();
    });

} else {
    const app = express();
    app.use(express.json());

    // Connect to MongoDB Atlas
    mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 100, // Adjust based on your needs
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    })
    .then(() => console.log('Worker connected to MongoDB Atlas'))
    .catch(err => console.error('MongoDB connection error:', err));

    // Middleware to track concurrent requests
    app.use((req, res, next) => {
        metrics.concurrentRequests++;
        res.on('finish', () => {
            metrics.concurrentRequests--;
        });
        next();
    });

    // Test endpoint for concurrent writes
    app.post('/test-write', async (req, res) => {
        const startTime = Date.now();
        
        try {
            // Get next request ID atomically
            const reqId = await getNextRequestId();
            
            // Simulate some processing time (optional)
            // await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

            // Create new request record
            const request = new Request({
                reqId,
                timestamp: new Date(),
                processTime: Date.now() - startTime,
                serverInstance: process.pid.toString()
            });

            await request.save();

            // Update metrics
            metrics.totalRequests++;
            const processTime = Date.now() - startTime;
            metrics.avgProcessingTime = 
                (metrics.avgProcessingTime * (metrics.totalRequests - 1) + processTime) / metrics.totalRequests;
            metrics.maxProcessingTime = Math.max(metrics.maxProcessingTime, processTime);

            res.json({
                success: true,
                reqId,
                processTime,
                serverInstance: process.pid
            });

        } catch (error) {
            metrics.failedRequests++;
            console.error('Write error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                serverInstance: process.pid
            });
        }
    });

    // Metrics endpoint
    app.get('/metrics', (req, res) => {
        res.json({
            ...metrics,
            workerId: process.pid,
            memoryUsage: process.memoryUsage()
        });
    });

    // Get last N requests
    app.get('/last-requests/:count', async (req, res) => {
        try {
            const count = parseInt(req.params.count) || 10;
            const requests = await Request.find()
                .sort({ timestamp: -1 })
                .limit(count);
            res.json(requests);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Worker ${process.pid} started on port ${PORT}`);
    });
}