// import axios from "axios";
// import { useAuthStore } from "@/store/authStore";
// import type {
//   Attestation,
//   Campaign,
//   Donation,
//   PaymentMethod,
//   DonationCreateResponse,
//   DonorDashboardResponse,
//   DisbursementResponse,
//   PendingNgoAttestation,
//   AdminPendingCampaign,
//   AdminPendingDisbursement,
//   AdminAuditLog,
//   AuditLogPagination,
// } from "@/types";
// import type { User } from "@/store/authStore";

// // Define the structure of the public campaigns response to resolve LINT error
// interface PublicCampaignsResponse {
//   data: Campaign[];
//   pagination: {
//     limit: number;
//     cursor: string | null;
//     hasNextPage: boolean;
//   };
// }

// // Create axios instance with base URL and interceptors
// const apiClient = axios.create({
//   baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
//   timeout: 10000, // 10 seconds
//   withCredentials: true,
//   headers: {
//     "Content-Type": "application/json",
//   },
// });

// // Request interceptor to add auth token
// apiClient.interceptors.request.use(
//   (config) => {
//     const { token } = useAuthStore.getState();
//     if (token) {
//       config.headers.Authorization = `Bearer ${token}`;
//     }
//     return config;
//   },
//   (error) => {
//     return Promise.reject(error);
//   },
// );

// // Response interceptor for error handling
// apiClient.interceptors.response.use(
//   (response) => response,
//   (error) => {
//     // Handle common error cases
//     if (error.response) {
//       // Server responded with error status
//       switch (error.response.status) {
//         case 401:
//           // Unauthorized - clear auth state completely
//           useAuthStore.getState().logout();
//           break;
//         case 403:
//           // Forbidden
//           break;
//         case 404:
//           // Not found
//           break;
//         case 409:
//           if (error.config?.url?.includes("attestation")) {
//             error.message = "This attestation has already been requested.";
//           }
//           break;
//         case 429:
//           // Rate limit exceeded
//           break;
//         case 500:
//           // Internal server error
//           break;
//         default:
//           break;
//       }
//     }

//     // Log error for debugging (remove in production)
//     if (import.meta.env.DEV) {
//       console.error("API Error:", error);
//     }

//     return Promise.reject(error);
//   },
// );

// // Generic GET request
// export const get = async <T>(url: string, params = {}): Promise<T> => {
//   const response = await apiClient.get<T>(url, { params });
//   return response.data;
// };

// // Generic POST request
// export const post = async <T>(url: string, data = {}): Promise<T> => {
//   const response = await apiClient.post<T>(url, data);
//   return response.data;
// };

// // Generic PUT request
// export const put = async <T>(url: string, data = {}): Promise<T> => {
//   const response = await apiClient.put<T>(url, data);
//   return response.data;
// };

// // Generic DELETE request
// export const del = async <T>(url: string): Promise<T> => {
//   const response = await apiClient.delete<T>(url);
//   return response.data;
// };

// // Specialized API service functions
// export const apiService = {
//   // Authentication
//   auth: {
//     //Changed from any to User to fix LINT error
//     login: (email: string, password: string) =>
//       post<{ token: string; user: User }>("/auth/login", { email, password }),
//     //Cause of lint error
//     // register: (userData: any) =>
//     //   post<{ token: string; user: any }>("/auth/register", userData),
//     register: (userData: { name: string; email: string; password: string }) =>
//       post<{ token: string; user: User }>("/auth/register", userData),
//     submitKyc: (pan: string) => post("/donor/kyc", { pan }),
//     logout: () => post("/auth/logout", {}),
//   },

//   // Donations
//   donations: {
//     // getByUser: async (userId: string) => {
//     //Remove parameter: _userId?: string as not needed to fix LINT error
//     // getByUser: async () => {
//     //   const data = await get<DonorDashboardResponse>(`/donor/dashboard`);
//     //   return (data.donations || []).map((d) => ({
//     //     ...d,
//     //     campaignTitle: d.project?.title,
//     //     campaignId: d.project?.id,
//     //     ngoName: d.ngo?.organisationName,
//     //     ngoId: d.ngo?.id,
//     //     razorpayOrderId: d.razorpayOrderId,
//     //     orderId: d.razorpayOrderId,
//     //   }));
//     // },
//     getByUser: async (): Promise<Donation[]> => {
//       const data = await get<DonorDashboardResponse>("/donor/dashboard");

//       return (data.donations || []).map((d) => ({
//         id: d.id,
//         publicId: d.publicId,
//         campaignId: d.project.id,
//         campaignTitle: d.project.title,
//         amount: d.amount,
//         paymentMethod: d.paymentMethod as PaymentMethod,
//         status: d.status,
//         createdAt: d.createdAt,
//         razorpayOrderId: d.razorpayOrderId,
//         razorpayPaymentId: d.razorpayPaymentId,
//         orderId: d.razorpayOrderId,
//         taxReceiptUrl: d.taxReceiptUrl,
//         ngoId: d.ngo.id,
//         ngoName: d.ngo.organisationName,
//       }));
//     },
//     create: (donationData: {
//       campaignId: string;
//       ngoId: string;
//       amount: number;
//       paymentMethod: string;
//     }) => post<DonationCreateResponse>("/donor/donate", donationData),
//     getAttestation: (donationId: string): Promise<Attestation> =>
//       get(`/donor/donations/${donationId}/attestation`),
//     requestAttestation: (donationId: string, type: "receipt" | "delivery") =>
//       post(`/donor/donations/${donationId}/attestation`, { type }),
//   },

//   // Campaigns
//   campaigns: {
//     getAll: async () => {
//       const res = await get<PublicCampaignsResponse>("/public/campaigns");
//       return Array.isArray(res) ? res : res?.data || [];
//     },
//     getById: (campaignId: string) => get(`/public/campaigns/${campaignId}`),
//     //Cause of LINT error
//     // getByNgo: async () => {
//     //   const res = await get<any>("/charity/campaigns");
//     //   return Array.isArray(res) ? res : res?.data || [];
//     // },
//     getByNgo: async () => {
//       const res = await get<Campaign[]>("/charity/campaigns");
//       return res;
//     },
//     //CAuse of LINT error
//     // create: (campaignData: any) =>
//     //   post<Campaign>("/charity/campaigns", campaignData),
//     create: (campaignData: {
//       title: string;
//       description: string;
//       targetAmount: number;
//       currencyCode?: string;
//       category?: string;
//       coverImageUrl?: string;
//       sdgTags?: string[];
//       beneficiaryId?: string;
//     }) => post<Campaign>("/charity/campaigns", campaignData),
//     submit: (campaignId: string) =>
//       post<Campaign>(`/charity/campaigns/${campaignId}/submit`),
//     getBeneficiaryId: (campaignId: string) =>
//       get<{ beneficiaryId: string }>(
//         `/charity/campaigns/${campaignId}/beneficiary-id`,
//       ),
//   },

//   // Milestones
//   milestones: {
//     approve: (milestoneId: string) =>
//       post(`/admin/disbursements/${milestoneId}/approve`),
//     reject: (milestoneId: string, reason: string) =>
//       post(`/admin/disbursements/${milestoneId}/reject`, { reason }),
//     //Cause of LINT error
//     //  uploadProof: async (milestoneId: string, proofData: any) => {
//     uploadProof: async (milestoneId: string, proofData: File) => {
//       const formData = new FormData();
//       formData.append("file", proofData);
//       const response = await apiClient.post(
//         `/charity/disburse/${milestoneId}/proof`,
//         formData,
//         {
//           headers: { "Content-Type": "multipart/form-data" },
//         },
//       );
//       return response.data;
//     },
//   },

//   // Attestations
//   attestations: {
//     getById: (attestationId: string) => get(`/attestations/${attestationId}`),
//     verify: (attestationId: string) =>
//       get(`/attestations/${attestationId}/verify`),
//     approve: (attestationId: string) =>
//       post(`/admin/attestations/${attestationId}/approve`),
//     reject: (attestationId: string, reason: string) =>
//       post(`/admin/attestations/${attestationId}/reject`, { reason }),
//   },

//   // Charity
//   charity: {
//     onboard: (data: {
//       organisationName: string;
//       registrationNo: string;
//       description?: string;
//       fcraNumber?: string;
//       taxExemptionNo80g?: string;
//     }) => post("/charity/onboard", data),

//     // getDisbursements: async () => {
//     //   const res = await get<any>("/charity/disbursements");
//     //   return Array.isArray(res) ? res : res?.data || [];
//     // },

//     getDisbursements: async () => {
//       const res = await get<DisbursementResponse[]>("/charity/disbursements");
//       return Array.isArray(res) ? res : [];
//     },
//     //Cause of LINT error
//     // uploadDisbursementProof: async (disbursementId: string, proofData: any) => {
//     uploadDisbursementProof: async (
//       disbursementId: string,
//       proofData: File,
//     ) => {
//       const formData = new FormData();
//       formData.append("file", proofData);
//       const response = await apiClient.post(
//         `/charity/disburse/${disbursementId}/proof`,
//         formData,
//         {
//           headers: { "Content-Type": "multipart/form-data" },
//         },
//       );
//       return response.data;
//     },
//   },

//   // NGOs
//   ngos: {
//     //Cause of LINT error changed from any to PendingNgoAttestation
//     getPendingAttestations: () =>
//       get<PendingNgoAttestation[]>("/charity/attestations/pending"),
//     signAttestation: (
//       donationId: string,
//       type: "receipt" | "delivery",
//       beneficiaryId?: string,
//     ) =>
//       post(`/charity/attestations`, {
//         donationId,
//         type: type.toUpperCase(),
//         ...(beneficiaryId && { beneficiaryId }),
//       }),
//   },

//   // Admin
//   admin: {
//     //Change any to AdminPendingCampaign to fix LINT error
//     getPendingCampaigns: () =>
//       get<AdminPendingCampaign[]>("/admin/campaigns/pending"),

//     approveCampaign: (campaignId: string) =>
//       post(`/admin/campaigns/${campaignId}/approve`),
//     //Change any to AdminPendingAttestation to fix LINT error
//     getPendingAttestations: () =>
//       get<AdminPendingCampaign[]>("/admin/attestations/pending"),

//     //Change any to AdminPendingDisbursement to fix LINT error
//     getPendingMilestones: () =>
//       get<AdminPendingDisbursement[]>("/admin/disbursements/pending"),

//     approveAttestation: (attestationId: string) =>
//       post(`/admin/attestations/${attestationId}/approve`),
//     rejectAttestation: (attestationId: string, reason: string) =>
//       post(`/admin/attestations/${attestationId}/reject`, { reason }),
//     approveMilestone: (milestoneId: string) =>
//       post(`/admin/disbursements/${milestoneId}/approve`),
//     rejectMilestone: (milestoneId: string, reason: string) =>
//       post(`/admin/disbursements/${milestoneId}/reject`, { reason }),
//     getAuditLogs: (params?: {
//       page?: number;
//       limit?: number;
//       action?: string;
//       userId?: string;
//     }) => {
//       const query = new URLSearchParams();
//       if (params?.page) query.append("page", params.page.toString());
//       if (params?.limit) query.append("limit", params.limit.toString());
//       if (params?.action) query.append("action", params.action);
//       if (params?.userId) query.append("userId", params.userId);
//       //Below cause of Lint error
//       //return get<{ auditLogs: any[]; pagination: any }>(
//       return get<{
//         auditLogs: AdminAuditLog[];
//         pagination: AuditLogPagination;
//       }>(`/admin/audit-logs?${query.toString()}`);
//     },
//   },

//   // Webhooks / Simulation
//   webhooks: {
//     simulateSuccess: (donationId: string) =>
//       post<{ success: boolean; message: string }>(
//         "/webhooks/simulate-success",
//         { donationId },
//       ),
//   },

//   // Public
//   public: {
//     getNgos: () =>
//       get<
//         {
//           id: string;
//           name: string;
//           totalCampaigns: number;
//           activeCampaigns: number;
//           totalRaised: number;
//         }[]
//       >("/public/ngos"),
//   },
// };

// export default apiClient;

import axios from "axios";
import { useAuthStore } from "@/store/authStore";

// Create axios instance with base URL and interceptors
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
  timeout: 10000, // 10 seconds
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const { token } = useAuthStore.getState();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

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
          useAuthStore.getState().logout();
          break;
        case 403:
          // Forbidden
          break;
        case 404:
          // Not found
          break;
        case 409:
          if (error.config?.url?.includes("attestation")) {
            error.message = "This attestation has already been requested.";
          }
          break;
        case 429:
          // Rate limit exceeded
          break;
        case 500:
          // Internal server error
          break;
        default:
          break;
      }
    }

    // Log error for debugging (remove in production)
    if (import.meta.env.DEV) {
      console.error("API Error:", error);
    }

    return Promise.reject(error);
  },
);

// Generic GET request
export const get = async <T>(url: string, params = {}): Promise<T> => {
  const response = await apiClient.get<T>(url, { params });
  return response.data;
};

// Generic POST request
export const post = async <T>(url: string, data = {}): Promise<T> => {
  const response = await apiClient.post<T>(url, data);
  return response.data;
};

// Generic PUT request
export const put = async <T>(url: string, data = {}): Promise<T> => {
  const response = await apiClient.put<T>(url, data);
  return response.data;
};

// Generic DELETE request
export const del = async <T>(url: string): Promise<T> => {
  const response = await apiClient.delete<T>(url);
  return response.data;
};

// Specialized API service functions
export const apiService = {
  // Authentication
  auth: {
    login: (email: string, password: string) =>
      post<{ token: string; user: any }>("/auth/login", { email, password }),
    register: (userData: any) =>
      post<{ token: string; user: any }>("/auth/register", userData),
    submitKyc: (pan: string) => post("/donor/kyc", { pan }),
    logout: () => post("/auth/logout", {}),
  },

  // Donations
  donations: {
    // getByUser: async (userId: string) => {
    getByUser: async (_userId?: string) => {
      const data = await get<any>(`/donor/dashboard`);
      return (data.donations || []).map((d: any) => ({
        ...d,
        campaignTitle: d.project?.title,
        campaignId: d.project?.id,
        ngoName: d.ngo?.organisationName,
        ngoId: d.ngo?.id,
        razorpayOrderId: d.razorpayOrderId,
        orderId: d.razorpayOrderId,
      }));
    },
    create: (donationData: any) => post("/donor/donate", donationData),
    getAttestation: (donationId: string) =>
      get(`/donor/donations/${donationId}/attestation`),
    requestAttestation: (donationId: string, type: "receipt" | "delivery") =>
      post(`/donor/donations/${donationId}/attestation`, { type }),
  },

  // Campaigns
  campaigns: {
    getAll: async () => {
      const res = await get<any>("/public/campaigns");
      return Array.isArray(res) ? res : res?.data || [];
    },
    getById: (campaignId: string) => get(`/public/campaigns/${campaignId}`),
    getByNgo: async () => {
      const res = await get<any>("/charity/campaigns");
      return Array.isArray(res) ? res : res?.data || [];
    },
    create: (campaignData: any) => post("/charity/campaigns", campaignData),
    submit: (campaignId: string) =>
      post(`/charity/campaigns/${campaignId}/submit`),
    getBeneficiaryId: (campaignId: string) =>
      get<{ beneficiaryId: string }>(
        `/charity/campaigns/${campaignId}/beneficiary-id`,
      ),
  },

  // Milestones
  milestones: {
    approve: (milestoneId: string) =>
      post(`/admin/disbursements/${milestoneId}/approve`),
    reject: (milestoneId: string, reason: string) =>
      post(`/admin/disbursements/${milestoneId}/reject`, { reason }),
    uploadProof: async (milestoneId: string, proofData: any) => {
      const formData = new FormData();
      formData.append("file", proofData);
      const response = await apiClient.post(
        `/charity/disburse/${milestoneId}/proof`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      return response.data;
    },
  },

  // Attestations
  attestations: {
    getById: (attestationId: string) => get(`/attestations/${attestationId}`),
    verify: (attestationId: string) =>
      get(`/attestations/${attestationId}/verify`),
    approve: (attestationId: string) =>
      post(`/admin/attestations/${attestationId}/approve`),
    reject: (attestationId: string, reason: string) =>
      post(`/admin/attestations/${attestationId}/reject`, { reason }),
  },

  // Charity
  charity: {
    onboard: (data: {
      organisationName: string;
      registrationNo: string;
      description?: string;
      fcraNumber?: string;
      taxExemptionNo80g?: string;
    }) => post("/charity/onboard", data),
    getDisbursements: async () => {
      const res = await get<any>("/charity/disbursements");
      return Array.isArray(res) ? res : res?.data || [];
    },
    uploadDisbursementProof: async (disbursementId: string, proofData: any) => {
      const formData = new FormData();
      formData.append("file", proofData);
      const response = await apiClient.post(
        `/charity/disburse/${disbursementId}/proof`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      return response.data;
    },
  },

  // NGOs
  ngos: {
    getPendingAttestations: () => get<any[]>("/charity/attestations/pending"),
    signAttestation: (
      donationId: string,
      type: "receipt" | "delivery",
      beneficiaryId?: string,
    ) =>
      post(`/charity/attestations`, {
        donationId,
        type: type.toUpperCase(),
        ...(beneficiaryId && { beneficiaryId }),
      }),
  },

  // Admin
  admin: {
    getPendingCampaigns: () => get<any[]>("/admin/campaigns/pending"),
    approveCampaign: (campaignId: string) =>
      post(`/admin/campaigns/${campaignId}/approve`),
    getPendingAttestations: () => get<any[]>("/admin/attestations/pending"),
    getPendingMilestones: () => get<any[]>("/admin/disbursements/pending"),
    approveAttestation: (attestationId: string) =>
      post(`/admin/attestations/${attestationId}/approve`),
    rejectAttestation: (attestationId: string, reason: string) =>
      post(`/admin/attestations/${attestationId}/reject`, { reason }),
    approveMilestone: (milestoneId: string) =>
      post(`/admin/disbursements/${milestoneId}/approve`),
    rejectMilestone: (milestoneId: string, reason: string) =>
      post(`/admin/disbursements/${milestoneId}/reject`, { reason }),
    getAuditLogs: (params?: {
      page?: number;
      limit?: number;
      action?: string;
      userId?: string;
    }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append("page", params.page.toString());
      if (params?.limit) query.append("limit", params.limit.toString());
      if (params?.action) query.append("action", params.action);
      if (params?.userId) query.append("userId", params.userId);
      return get<{ auditLogs: any[]; pagination: any }>(
        `/admin/audit-logs?${query.toString()}`,
      );
    },
  },

  // Webhooks / Simulation
  webhooks: {
    simulateSuccess: (donationId: string) =>
      post<{ success: boolean; message: string }>(
        "/webhooks/simulate-success",
        { donationId },
      ),
  },

  // Public
  public: {
    getNgos: () =>
      get<
        {
          id: string;
          name: string;
          totalCampaigns: number;
          activeCampaigns: number;
          totalRaised: number;
        }[]
      >("/public/ngos"),
  },
};

export default apiClient;
