import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiService } from "@/utils/apiClient";
import { useAuthStore } from "@/store/authStore";
import {
  validatePAN,
  validateSection12Registration,
  validateSection80GRegistration,
  validateDarpanId,
  validateCSRRegistration,
} from "@/utils/validation";

const ProfileFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
});

const NgoOnboardSchema = z.object({
  organisationName: z
    .string()
    .min(2, "Organisation name must be at least 2 characters"),
  registrationNo: z
    .string()
    .min(3, "Registration number must be at least 3 characters"),
  description: z.string().optional(),
});

export default function Profile() {
  const { user, setUser } = useAuthStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(user?.email || "");
  // "@ts-expect-error" user.name is not in the type definition, falling back nicely
  const [name, setName] = useState(user?.name || "");

  const handlePreferenceToggle = (setting: string, state: boolean) => {
    toast({
      title: "Preferences Updated",
      description: `${setting} ${state ? "enabled" : "disabled"}.`,
    });
  };

  const [ngoLoading, setNgoLoading] = useState(false);
  const [ngoSuccessMsg, setNgoSuccessMsg] = useState("");
  const [orgName, setOrgName] = useState("");
  const [regNo, setRegNo] = useState("");
  const [description, setDescription] = useState("");

  // Credential validation fields (not sent to backend)
  const [pan, setPan] = useState("");
  const [section12Registration, setSection12Registration] = useState("");
  const [section80gRegistration, setSection80gRegistration] = useState("");
  const [darpanId, setDarpanId] = useState("");
  const [csrRegistrationNo, setCsrRegistrationNo] = useState("");

  // Validation error states
  const [panError, setPanError] = useState("");
  const [section12Error, setSection12Error] = useState("");
  const [section80gError, setSection80gError] = useState("");
  const [darpanError, setDarpanError] = useState("");
  const [csrError, setCsrError] = useState("");

  const handleNgoOnboard = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate basic fields first
    const basicResult = NgoOnboardSchema.safeParse({
      organisationName: orgName,
      registrationNo: regNo,
      description,
      // fcraNumber: fcra,
      // taxExemptionNo80g: taxExemption,
    });

    if (!basicResult.success) {
      toast({
        title: "Validation Error",
        description: basicResult.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }

    // Validate credential fields in order: PAN, 12A, 80G, DARPAN, CSR
    let firstError = '';

    // PAN
    const panResult = validatePAN(pan);
    if (panResult.status === 'INVALID_FORMAT') {
      setPanError('Invalid PAN format');
      if (!firstError) firstError = 'Invalid PAN format';
    } else {
      setPanError('');
    }

    // 12A
    const section12Result = section12Registration
      ? validateSection12Registration(section12Registration, panResult.normalizedValue || '')
      : { valid: true, status: 'MISSING' };
    if (section12Result.status === 'INVALID_FORMAT') {
      setSection12Error('Invalid 12A/12AB registration format');
      if (!firstError) firstError = 'Invalid 12A/12AB registration format';
    } else if (section12Result.status === 'PAN_MISMATCH') {
      setSection12Error('12A/12AB registration PAN does not match NGO PAN');
      if (!firstError) firstError = '12A/12AB registration PAN does not match NGO PAN';
    } else {
      setSection12Error('');
    }

    // 80G
    const section80gResult = section80gRegistration
      ? validateSection80GRegistration(section80gRegistration, panResult.normalizedValue || '')
      : { valid: true, status: 'MISSING' };
    if (section80gResult.status === 'INVALID_FORMAT') {
      setSection80gError('Invalid 80G registration format');
      if (!firstError) firstError = 'Invalid 80G registration format';
    } else if (section80gResult.status === 'PAN_MISMATCH') {
      setSection80gError('80G registration PAN does not match NGO PAN');
      if (!firstError) firstError = '80G registration PAN does not match NGO PAN';
    } else {
      setSection80gError('');
    }

    // DARPAN
    const darpanResult = darpanId
      ? validateDarpanId(darpanId)
      : { valid: true, status: 'MISSING' };
    if (darpanResult.status === 'INVALID_FORMAT') {
      setDarpanError('Invalid DARPAN ID format');
      if (!firstError) firstError = 'Invalid DARPAN ID format';
    } else {
      setDarpanError('');
    }

    // CSR
    const csrResult = csrRegistrationNo
      ? validateCSRRegistration(csrRegistrationNo)
      : { valid: true, status: 'MISSING' };
    if (csrResult.status === 'INVALID_FORMAT') {
      setCsrError('Invalid CSR registration format');
      if (!firstError) firstError = 'Invalid CSR registration format';
    } else {
      setCsrError('');
    }

    if (firstError) {
      toast({
        title: "Validation Error",
        description: firstError,
        variant: "destructive",
      });
      return;
    }

    // All validations passed, proceed with submission
    setNgoLoading(true);
    try {
      await apiService.charity.onboard(basicResult.data);
      setNgoSuccessMsg(
        "Your application has been submitted. An admin will review it shortly.",
      );
      toast({
        title: "Application submitted",
        description: "Your NGO application is under review.",
      });
    } catch (error: unknown) {
      // catch (error: any) {
      //     toast({
      //         title: 'Application failed',
      //         description: error?.response?.data?.error || 'An error occurred while submitting your application.',
      //         variant: 'destructive'
      //     })
      // }

      const message =
        typeof error === "object" &&
          error !== null &&
          "response" in error &&
          typeof error.response === "object" &&
          error.response !== null &&
          "data" in error.response &&
          typeof error.response.data === "object" &&
          error.response.data !== null &&
          "error" in error.response.data &&
          typeof error.response.data.error === "string"
          ? error.response.data.error
          : "An error occurred while submitting your application.";

      toast({
        title: "Application failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setNgoLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = ProfileFormSchema.safeParse({ name, email });
    if (!result.success) {
      toast({
        title: "Validation Error",
        description: result.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      toast({
        title: "Profile updated",
        description: "Your profile information has been saved",
      });
    } catch {
      toast({
        title: "Update failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await apiService.auth.logout();
      setUser(null);
    } catch {
      toast({
        title: "Logout failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6">
        <h2 className="text-4xl font-bold tracking-tighter">Access Denied</h2>
        <p className="text-muted-foreground text-lg max-w-md text-balance">
          Please sign in to view your profile.
        </p>
        <Button onClick={() => navigate("/login")}>Sign In</Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-12 md:py-16 space-y-16 animate-fade-in">
      <div className="space-y-2">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter">
          Settings
        </h1>
        <p className="text-muted-foreground text-lg">
          Manage your account preferences and personal information.
        </p>
      </div>

      <div className="space-y-12">
        {/* Personal Information Section */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Personal information
          </h2>
          <div className="bg-foreground/[0.02] p-6 md:p-8">
            <form onSubmit={handleUpdateProfile} className="space-y-6 max-w-xl">
              <div className="space-y-2">
                <Label htmlFor="profile-email">Email Address</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Changing your email will require re-verification.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-name">Full Name</Label>
                <Input
                  id="profile-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="bg-background"
                />
              </div>
              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </section>
        {/*Changed user as any to user simply to correct LINT Error*/}
        {/* Institution Registration Section */}
        {(!user ||
          !user.role ||
          user.role === "DONOR" ||
          user.role === "CHARITY") && (
            <section className="space-y-6">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Institution Registration
              </h2>
              <div className="bg-foreground/[0.02] p-6 md:p-8">
                {user.role === "CHARITY" || ngoSuccessMsg ? (
                  <p className="text-muted-foreground font-medium">
                    {ngoSuccessMsg || "NGO status active."}
                  </p>
                ) : (
                  <form
                    onSubmit={handleNgoOnboard}
                    className="space-y-6 max-w-xl"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="org-name">Organisation Name *</Label>
                      <Input
                        id="org-name"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="Enter registered NGO name"
                        className="bg-background"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-no">Registration Number *</Label>
                      <Input
                        id="reg-no"
                        value={regNo}
                        onChange={(e) => setRegNo(e.target.value)}
                        placeholder="Enter official registration ID"
                        className="bg-background"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="desc">Description (Optional)</Label>
                      <Input
                        id="desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Briefly describe your mission"
                        className="bg-background"
                      />
                    </div>

                    {/* NGO Registration Credential Validation (frontend only - not sent to backend) */}
                    <div className="space-y-4 pt-4 border-t">
                      <h3 className="text-lg font-medium text-foreground mb-2">NGO Registration Credentials</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        <b>These credentials are validated locally in your browser and are NOT sent to our servers.</b>
                      </p>

                      {/* PAN */}
                      <div className="space-y-2">
                        <Label htmlFor="pan-input">NGO PAN *</Label>
                        <Input
                          id="pan-input"
                          value={pan}
                          onChange={(e) => setPan(e.target.value)}
                          placeholder="Enter your NGO's PAN"
                          className="bg-background"
                          required
                        />
                        {panError && (
                          <p className="text-xs text-destructive mt-1">
                            {panError}
                          </p>
                        )}
                      </div>

                      {/* Section 12A/12AB Registration */}
                      <div className="space-y-2">
                        <Label htmlFor="section12-input">Section 12A/12AB Registration *</Label>
                        <Input
                          id="section12-input"
                          value={section12Registration}
                          onChange={(e) => setSection12Registration(e.target.value)}
                          placeholder="Enter 12A/12AB registration"
                          className="bg-background"
                        />
                        {section12Error && (
                          <p className="text-xs text-destructive mt-1">
                            {section12Error}
                          </p>
                        )}
                      </div>

                      {/* Section 80G Registration */}
                      <div className="space-y-2">
                        <Label htmlFor="section80g-input">Section 80G Registration </Label>
                        <Input
                          id="section80g-input"
                          value={section80gRegistration}
                          onChange={(e) => setSection80gRegistration(e.target.value)}
                          placeholder="Enter 80G registration"
                          className="bg-background"
                        />
                        {section80gError && (
                          <p className="text-xs text-destructive mt-1">
                            {section80gError}
                          </p>
                        )}
                      </div>

                      {/* DARPAN ID */}
                      <div className="space-y-2">
                        <Label htmlFor="darpan-input">DARPAN ID </Label>
                        <Input
                          id="darpan-input"
                          value={darpanId}
                          onChange={(e) => setDarpanId(e.target.value)}
                          placeholder="Enter DARPAN ID"
                          className="bg-background"
                        />
                        {darpanError && (
                          <p className="text-xs text-destructive mt-1">
                            {darpanError}
                          </p>
                        )}
                      </div>

                      {/* CSR Registration Number */}
                      <div className="space-y-2">
                        <Label htmlFor="csr-input">CSR Registration Number </Label>
                        <Input
                          id="csr-input"
                          value={csrRegistrationNo}
                          onChange={(e) => setCsrRegistrationNo(e.target.value)}
                          placeholder="Enter CSR registration"
                          className="bg-background"
                        />
                        {csrError && (
                          <p className="text-xs text-destructive mt-1">
                            {csrError}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="pt-4">
                      <Button
                        type="submit"
                        disabled={ngoLoading}
                        className="w-full sm:w-auto"
                      >
                        {ngoLoading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        Submit Application
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </section>
          )}

        {/* Preferences Section */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Preferences
          </h2>
          <div className="bg-foreground/[0.02] p-6 md:p-8 space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive updates about your donations and campaigns.
                </p>
              </div>
              <Switch
                defaultChecked={true}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handlePreferenceToggle(
                    "Email notifications",
                    e.target.checked,
                  )
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Public Profile</Label>
                <p className="text-sm text-muted-foreground">
                  Allow others to see your donation history.
                </p>
              </div>
              <Switch
                defaultChecked={false}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handlePreferenceToggle("Public profile", e.target.checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Blockchain Explorer Link</Label>
                <p className="text-sm text-muted-foreground">
                  Show direct links to Solana transactions.
                </p>
              </div>
              <Switch
                defaultChecked={true}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handlePreferenceToggle("Blockchain links", e.target.checked)
                }
              />
            </div>
          </div>
        </section>

        {/* Danger Zone Section */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Danger zone
          </h2>
          <div className="bg-foreground/[0.02] p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <h3 className="font-medium">Sign Out</h3>
                <p className="text-sm text-muted-foreground">
                  Securely end your current session.
                </p>
              </div>
              <Button
                onClick={handleLogout}
                disabled={loading}
                className="w-full sm:w-auto bg-foreground/[0.06] text-foreground hover:bg-destructive hover:text-white transition-colors"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Sign Out
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
