import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

// Create axios instance with base URL and interceptors
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  timeout: 10000, // 10 seconds
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const { token } = useAuthStore.getState()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle common error cases
    if (error.response) {
      // Server responded with error status
      switch (error.response.status) {
        case 401:
          // Unauthorized - clear auth state completely
          useAuthStore.getState().logout()
          break
        case 403:
          // Forbidden
          break
        case 404:
          // Not found
          break
        case 409:
          if (error.config?.url?.includes('attestation')) {
            error.message = 'This attestation has already been requested.';
          }
          break
        case 429:
          // Rate limit exceeded
          break
        case 500:
          // Internal server error
          break
        default:
          break
      }
    }

    // Log error for debugging (remove in production)
    if (import.meta.env.DEV) {
      console.error('API Error:', error)
    }

    return Promise.reject(error)
  }
)

// Generic GET request
export const get = async <T>(url: string, params = {}): Promise<T> => {
  const response = await apiClient.get<T>(url, { params })
  return response.data
}

// Generic POST request
export const post = async <T>(url: string, data = {}): Promise<T> => {
  const response = await apiClient.post<T>(url, data)
  return response.data
}

// Generic PUT request
export const put = async <T>(url: string, data = {}): Promise<T> => {
  const response = await apiClient.put<T>(url, data)
  return response.data
}

// Generic DELETE request
export const del = async <T>(url: string): Promise<T> => {
  const response = await apiClient.delete<T>(url)
  return response.data
}

// Specialized API service functions
export const apiService = {
  // Authentication
  auth: {
    login: (email: string, password: string) =>
      post<{ token: string; user: any }>('/auth/login', { email, password }),
    register: (userData: any) =>
      post<{ token: string; user: any }>('/auth/register', userData),
    logout: () => post('/auth/logout', {}),
  },

  // Donations
  donations: {
    getByUser: async (userId: string) => {
      const data = await get<any>(`/donor/dashboard`);
      return (data.donations || []).map((d: any) => ({
        ...d,
        campaignTitle: d.project?.title,
        campaignId: d.project?.id,
        ngoName: d.ngo?.organisationName,
        ngoId: d.ngo?.id,
      }));
    },
    create: (donationData: any) => post('/donor/donate', donationData),
    getAttestation: (donationId: string) =>
      get(`/donor/donations/${donationId}/attestation`),
    requestAttestation: (donationId: string, type: 'receipt' | 'delivery') =>
      post(`/donor/donations/${donationId}/attestation`, { type }),
  },

  // Campaigns
  campaigns: {
    getAll: async () => {
      const res = await get<any>('/public/campaigns');
      return Array.isArray(res) ? res : (res?.data || []);
    },
    getById: (campaignId: string) => get(`/public/campaigns/${campaignId}`),
    create: (campaignData: any) => post('/charity/campaigns', campaignData),
  },

  // Milestones
  milestones: {
    approve: (milestoneId: string) => post(`/admin/milestones/${milestoneId}/approve`),
    reject: (milestoneId: string, reason: string) =>
      post(`/admin/milestones/${milestoneId}/reject`, { reason }),
    uploadProof: async (milestoneId: string, proofData: any) => {
      const formData = new FormData();
      formData.append('file', proofData);
      const response = await apiClient.post(`/charity/disburse/${milestoneId}/proof`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data;
    },
  },

  // Attestations
  attestations: {
    getById: (attestationId: string) => get(`/attestations/${attestationId}`),
    verify: (attestationId: string) => get(`/attestations/${attestationId}/verify`),
    approve: (attestationId: string) => post(`/admin/attestations/${attestationId}/approve`),
    reject: (attestationId: string, reason: string) =>
      post(`/admin/attestations/${attestationId}/reject`, { reason }),
  },

  // Charity
  charity: {
    onboard: (data: {
      organisationName: string,
      registrationNo: string,
      description?: string,
      fcraNumber?: string,
      taxExemptionNo80g?: string
    }) => post('/charity/onboard', data),
  },

  // NGOs
  ngos: {
    getPendingAttestations: () => get<any[]>('/charity/attestations/pending'),
    signAttestation: (donationId: string, type: 'receipt' | 'delivery') =>
      post(`/charity/attestations`, { donationId, type: type.toUpperCase() }),
  },

  // Admin
  admin: {
    getPendingAttestations: () => get<any[]>('/admin/attestations/pending'),
    getPendingMilestones: () => get<any[]>('/admin/milestones/pending'),
    approveAttestation: (attestationId: string) =>
      post(`/admin/attestations/${attestationId}/approve`),
    rejectAttestation: (attestationId: string, reason: string) =>
      post(`/admin/attestations/${attestationId}/reject`, { reason }),
    approveMilestone: (milestoneId: string) =>
      post(`/admin/milestones/${milestoneId}/approve`),
    rejectMilestone: (milestoneId: string, reason: string) =>
      post(`/admin/milestones/${milestoneId}/reject`, { reason }),
  },

  // Public
  public: {
    getNgos: () => get<{ id: string, name: string, totalCampaigns: number, activeCampaigns: number, totalRaised: number }[]>('/public/ngos'),
  },
}

export default apiClient