import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

// Custom metric for tracking successful donations
const successfulDonations = new Counter('successful_donations');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 20 }, // ramp up to 20 users over 2 minutes
    { duration: '5m', target: 20 }, // stay at 20 users for 5 minutes
    { duration: '2m', target: 0 },  // ramp down to 0 users over 2 minutes
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must be below 500ms
    http_req_failed: ['rate<0.01'],   // less than 1% of requests can fail
    successfulDonations: ['count>10'], // at least 10 successful donations during the test
  },
};

// Helper function to generate random string
function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Main test function
export default function () {
  // 1. Create a donor user (in real test, we would have pre-created users)
  // For simplicity, we'll use a fixed donor token (in real scenario, we would need to handle auth dynamically)
  const donorToken = `__DONOR_TOKEN_PLACEHOLDER__`; // This should be replaced with a real token from pre-seeded user

  // 2. Get list of campaigns (assuming we have pre-created campaigns)
  const campaignsResponse = http.get('http://localhost:3001/api/public/campaigns', {
    headers: {
      'Authorization': `Bearer ${donorToken}`,
    },
  });

  check(campaignsResponse, {
    'campaigns fetched': (r) => r.status === 200,
    'has campaigns': (r) => r.json().length > 0,
  });

  if (campaignsResponse.status !== 200 || campaignsResponse.json().length === 0) {
    // If no campaigns, we cannot proceed with donation
    sleep(1);
    return;
  }

  const campaigns = campaignsResponse.json();
  const campaign = campaigns[Math.floor(Math.random() * campaigns.length)];

  // 3. Make a donation
  const donationPayload = {
    ngoId: campaign.ngoId, // Assuming campaign has ngoId field
    campaignId: campaign.id,
    amount: Math.floor(Math.random() * 1000) + 100, // Random amount between 100 and 1099 INR
    paymentMethod: Math.random() > 0.5 ? 'UPI' : 'CARD',
  };

  const donationResponse = http.post('http://localhost:3001/api/donor/donate', JSON.stringify(donationPayload), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${donorToken}`,
    },
  });

  const donationCheck = check(donationResponse, {
    'donation created': (r) => r.status === 200 || r.status === 201,
    'has orderId': (r) => !!r.json().orderId,
    'has publicDonationId': (r) => !!r.json().publicDonationId,
  });

  if (donationCheck['donation created']) {
    successfulDonations.add(1);
  }

  // 4. Simulate webhook (in real test, we would need to handle this differently)
  // For simplicity, we'll skip the webhook simulation in this load test

  // 5. Check donation status (optional)
  if (donationResponse.status === 200 || donationResponse.status === 201) {
    const publicDonationId = donationResponse.json().publicDonationId;
    const statusResponse = http.get(`http://localhost:3001/api/donor/donations/${publicDonationId}/timeline`, {
      headers: {
        'Authorization': `Bearer ${donorToken}`,
      },
    });

    check(statusResponse, {
      'status fetched': (r) => r.status === 200,
    });
  }

  // Think time between requests
  sleep(1);
}