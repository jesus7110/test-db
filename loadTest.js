const axios = require('axios');

async function runLoadTest(concurrentRequests, totalRequests) {
    const baseURL = 'http://147.79.70.65:3000';
    let completed = 0;
    let failed = 0;
    const startTime = Date.now();
    const results = [];

    console.log(`Starting load test with ${concurrentRequests} concurrent requests, ${totalRequests} total requests`);

    // Create a pool of promises
    async function makeRequest() {
        try {
            const response = await axios.post(`${baseURL}/test-write`);
            completed++;
            results.push(response.data.processTime);
            process.stdout.write(`\rCompleted: ${completed}, Failed: ${failed}`);
            return response.data;
        } catch (error) {
            failed++;
            process.stdout.write(`\rCompleted: ${completed}, Failed: ${failed}`);
            return null;
        }
    }

    // Run requests in batches
    for (let i = 0; i < totalRequests; i += concurrentRequests) {
        const batch = Math.min(concurrentRequests, totalRequests - i);
        const promises = Array(batch).fill().map(() => makeRequest());
        await Promise.all(promises);
    }

    // Calculate statistics
    const totalTime = Date.now() - startTime;
    const avgResponseTime = results.reduce((a, b) => a + b, 0) / results.length;
    const maxResponseTime = Math.max(...results);
    const requestsPerSecond = (completed / totalTime) * 1000;

    console.log('\n\nTest Results:');
    console.log('-------------');
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Successful Requests: ${completed}`);
    console.log(`Failed Requests: ${failed}`);
    console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`Max Response Time: ${maxResponseTime}ms`);
    console.log(`Requests per Second: ${requestsPerSecond.toFixed(2)}`);
    console.log(`Total Test Time: ${(totalTime / 1000).toFixed(2)}s`);
}

// Run the test
const CONCURRENT_REQUESTS = 1000;  // Adjust based on your needs
const TOTAL_REQUESTS = 10000;      // Adjust based on your needs

runLoadTest(CONCURRENT_REQUESTS, TOTAL_REQUESTS);