import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle, Activity, FileText, Home, LogOut, Menu, X,
  Upload, Brain, Heart, Bot, Eye, EyeOff, CheckCircle, XCircle, Shield
} from 'lucide-react';
import ChatbotPage from './ChatbotPage';
import { TokenStore, AuthAPI, PredictionAPI, ReportAPI, setSessionExpiredCallback } from './utils/api';

// ─── Password Strength Checker ───────────────────────────────────────────────
function getPasswordStrength(password) {
  let score = 0;
  const checks = {
    length:    password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number:    /\d/.test(password),
    special:   /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'/`~]/.test(password),
  };
  score = Object.values(checks).filter(Boolean).length;
  const labels    = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const colors    = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];
  const barColors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-green-600'];
  return { score, label: labels[score] || '', color: colors[score], barColor: barColors[score], checks };
}

// ─── Password Requirements Display ───────────────────────────────────────────
function PasswordRequirements({ password }) {
  const { checks } = getPasswordStrength(password);
  const requirements = [
    { key: 'length',    label: 'At least 8 characters' },
    { key: 'uppercase', label: 'One uppercase letter (A-Z)' },
    { key: 'lowercase', label: 'One lowercase letter (a-z)' },
    { key: 'number',    label: 'One number (0-9)' },
    { key: 'special',   label: 'One special character (!@#$...)' },
  ];
  return (
    <div className="mt-2 space-y-1">
      {requirements.map(({ key, label }) => (
        <div key={key} className="flex items-center space-x-2 text-xs">
          {checks[key]
            ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            : <XCircle    className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
          <span className={checks[key] ? 'text-green-600' : 'text-gray-400'}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Password Strength Bar ────────────────────────────────────────────────────
function PasswordStrengthBar({ password }) {
  if (!password) return null;
  const { score, label, barColor } = getPasswordStrength(password);
  return (
    <div className="mt-1.5">
      <div className="flex space-x-1 h-1.5 mb-1">
        {[1,2,3,4,5].map(i => (
          <div key={i} className={`flex-1 rounded-full transition-all duration-300 ${i <= score ? barColor : 'bg-gray-200'}`} />
        ))}
      </div>
      <p className="text-xs" style={{ color: score > 0 ? getPasswordStrength(password).color : '#9ca3af' }}>
        {label}
      </p>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function HealthcareApp() {
  const [isLoggedIn, setIsLoggedIn]         = useState(false);
  const [currentPage, setCurrentPage]       = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser]                     = useState(null);
  const [authLoading, setAuthLoading]       = useState(true);

  const handleSessionExpired = useCallback(() => {
    setIsLoggedIn(false);
    setUser(null);
    setCurrentPage('auth');
    TokenStore.clear();
  }, []);

  useEffect(() => { setSessionExpiredCallback(handleSessionExpired); }, [handleSessionExpired]);

  useEffect(() => {
    const restoreSession = async () => {
      if (!TokenStore.hasSession()) { setAuthLoading(false); return; }
      try {
        const userData = await AuthAPI.getMe();
        setUser(userData); setIsLoggedIn(true); setCurrentPage('dashboard');
      } catch {
        TokenStore.clear();
      } finally {
        setAuthLoading(false);
      }
    };
    restoreSession();
  }, []);

  const handleLogin = (userData, accessToken, refreshToken) => {
    TokenStore.set(accessToken, refreshToken, userData);
    setUser(userData); setIsLoggedIn(true); setCurrentPage('dashboard');
  };

  const handleLogout = async () => {
    await AuthAPI.logout();
    setIsLoggedIn(false); setUser(null); setCurrentPage('home');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center">
          <Heart className="w-12 h-12 text-pink-600 mx-auto animate-pulse mb-3" />
          <p className="text-gray-500">Loading Dr.Onco...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-purple-50">
      <nav className="bg-white shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Heart className="w-8 h-8 text-pink-600" />
              <span className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                Dr.Onco
              </span>
            </div>
            <div className="hidden md:flex items-center space-x-6">
              {isLoggedIn ? (
                <>
                  {[
                    ['dashboard',  'Dashboard',  <Home     className="w-4 h-4" />],
                    ['prediction', 'Prediction', <Activity className="w-4 h-4" />],
                    ['summarizer', 'Summarizer', <FileText className="w-4 h-4" />],
                    ['history',    'History',    <Brain    className="w-4 h-4" />],
                    ['chatbot',    'AI Doctor',  <Bot      className="w-4 h-4" />],
                  ].map(([page, label, icon]) => (
                    <button key={page} onClick={() => setCurrentPage(page)}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${currentPage === page ? 'bg-purple-100 text-purple-700' : 'hover:bg-gray-100'}`}>
                      {icon}<span>{label}</span>
                    </button>
                  ))}
                  <button onClick={handleLogout}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition">
                    <LogOut className="w-4 h-4" /><span>Logout</span>
                  </button>
                </>
              ) : (
                <button onClick={() => setCurrentPage('auth')}
                  className="px-6 py-2 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-lg hover:opacity-90 transition">
                  Login / Signup
                </button>
              )}
            </div>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden">
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="md:hidden pb-4">
              {isLoggedIn ? (
                <>
                  {[['dashboard','Dashboard'],['prediction','Prediction'],['summarizer','Summarizer'],
                    ['history','History'],['chatbot','AI Doctor']].map(([page, label]) => (
                    <button key={page} onClick={() => { setCurrentPage(page); setMobileMenuOpen(false); }}
                      className="block w-full px-4 py-2 hover:bg-gray-100 text-left">{label}</button>
                  ))}
                  <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                    className="block w-full px-4 py-2 text-red-600 hover:bg-red-50 text-left">Logout</button>
                </>
              ) : (
                <button onClick={() => { setCurrentPage('auth'); setMobileMenuOpen(false); }}
                  className="block w-full px-4 py-2 hover:bg-gray-100 text-left">Login / Signup</button>
              )}
            </div>
          )}
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8 flex-grow">
        {!isLoggedIn ? (
          currentPage === 'home' ? <HomePage setCurrentPage={setCurrentPage} /> : <AuthPage handleLogin={handleLogin} />
        ) : (
          <>
            {currentPage === 'dashboard'  && <Dashboard user={user} />}
            {currentPage === 'prediction' && <PredictionPage />}
            {currentPage === 'summarizer' && <SummarizerPage />}
            {currentPage === 'history'    && <HistoryPage />}
            {currentPage === 'chatbot'    && <ChatbotPage />}
          </>
        )}
      </main>

      <footer className="bg-gray-900 text-white py-8">
        <div className="container mx-auto text-center">
          <p className="mb-2">© 2025 Dr.Onco - Sanjay Ghodawat University</p>
          <p className="text-sm text-gray-400">Developed by Sai Khatake, Shashanki Shinde, Pooja Oswal</p>
        </div>
      </footer>
    </div>
  );
}

// ─── Home Page ────────────────────────────────────────────────────────────────
function HomePage({ setCurrentPage }) {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center py-20">
        <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
          AI-Powered Healthcare Solutions
        </h1>
        <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto">
          Early detection saves lives. Get personalized breast cancer risk assessment and instant medical report summaries powered by advanced AI.
        </p>
        <button onClick={() => setCurrentPage('auth')}
          className="px-8 py-4 bg-gradient-to-r from-pink-600 to-purple-600 text-white text-lg rounded-xl hover:opacity-90 transition shadow-lg">
          Get Started Now
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-8 mt-20">
        <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition">
          <Activity className="w-12 h-12 text-pink-600 mb-4" />
          <h3 className="text-2xl font-bold mb-3">Risk Prediction</h3>
          <p className="text-gray-600">Advanced multimodal AI analyzes biomarkers, demographics, and lifestyle to predict breast cancer risk with explainable results.</p>
        </div>
        <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition">
          <FileText className="w-12 h-12 text-purple-600 mb-4" />
          <h3 className="text-2xl font-bold mb-3">Report Summarizer</h3>
          <p className="text-gray-600">Upload medical reports and get instant, easy-to-understand summaries with key findings and personalized recommendations.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage({ handleLogin }) {
  const [isSignup, setIsSignup]       = useState(false);
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [fullName, setFullName]       = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);

  const strength       = getPasswordStrength(password);
  const passwordsMatch = password === confirmPass;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (isSignup) {
      if (strength.score < 5) { setError('Please meet all password requirements before continuing.'); return; }
      if (!passwordsMatch)    { setError('Passwords do not match.'); return; }
    }
    setLoading(true);
    try {
      const data = isSignup
        ? await AuthAPI.signup(email, password, fullName)
        : await AuthAPI.login(email, password);
      handleLogin(data.user, data.access_token, data.refresh_token);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsSignup(!isSignup); setError('');
    setPassword(''); setConfirmPass(''); setShowRequirements(false);
  };

  return (
    <div className="max-w-md mx-auto mt-10">
      <div className="bg-white p-8 rounded-2xl shadow-lg">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <Shield className="w-6 h-6 text-purple-600" />
          <h2 className="text-3xl font-bold">{isSignup ? 'Create Account' : 'Welcome Back'}</h2>
        </div>
        <p className="text-center text-gray-500 text-sm mb-6">
          {isSignup ? 'Secure sign-up for Dr.Onco' : 'Sign in to your Dr.Onco account'}
        </p>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-700 rounded-lg flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignup && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input type="text" placeholder="Dr. Jane Doe" value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input type="email" placeholder="you@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition"
              required autoComplete="email" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                placeholder={isSignup ? 'Create a strong password' : 'Enter your password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (!showRequirements) setShowRequirements(true); }}
                onFocus={() => isSignup && setShowRequirements(true)}
                className="w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition"
                required autoComplete={isSignup ? 'new-password' : 'current-password'} />
              <button type="button" tabIndex={-1} onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {isSignup && password && (
              <>
                <PasswordStrengthBar password={password} />
                {showRequirements && <PasswordRequirements password={password} />}
              </>
            )}
          </div>
          {isSignup && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className={`w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 outline-none transition ${
                    confirmPass
                      ? passwordsMatch ? 'border-green-400 focus:ring-green-400' : 'border-red-400 focus:ring-red-400'
                      : 'focus:ring-purple-500'
                  }`}
                  required />
                <button type="button" tabIndex={-1} onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {confirmPass && !passwordsMatch && <p className="text-xs text-red-500 mt-1">Passwords do not match</p>}
              {confirmPass && passwordsMatch && (
                <p className="text-xs text-green-500 mt-1 flex items-center space-x-1">
                  <CheckCircle className="w-3 h-3" /><span>Passwords match</span>
                </p>
              )}
            </div>
          )}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 font-semibold mt-2">
            {loading
              ? (isSignup ? 'Creating account...' : 'Signing in...')
              : (isSignup ? 'Create Account' : 'Sign In')}
          </button>
        </form>
        <div className="mt-4 text-center">
          <button onClick={switchMode} className="text-purple-600 hover:underline text-sm">
            {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
        {!isSignup && (
          <p className="text-center text-xs text-gray-400 mt-4">
            Your account will be locked for 15 minutes after 5 failed attempts.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ user }) {
  const [stats, setStats] = useState({ totalPredictions: 0, reportsAnalyzed: 0, lastRiskLevel: 'None yet' });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [predictions, reports] = await Promise.all([PredictionAPI.history(), ReportAPI.history()]);
        setStats({
          totalPredictions: Array.isArray(predictions) ? predictions.length : 0,
          reportsAnalyzed:  reports.reports?.length || 0,
          lastRiskLevel: Array.isArray(predictions) && predictions.length > 0
            ? predictions[predictions.length - 1].prediction?.risk_level || 'Unknown'
            : 'None yet',
        });
      } catch (err) { console.error('Stats error:', err); }
    };
    fetchStats();
  }, []);

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Welcome back, {user?.full_name || user?.email || 'User'}!</h1>
      <p className="text-gray-500 mb-8">Here's your health overview.</p>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-blue-500 text-white p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold mb-2">Total Predictions</h3>
          <p className="text-3xl font-bold">{stats.totalPredictions}</p>
        </div>
        <div className="bg-green-500 text-white p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold mb-2">Reports Analyzed</h3>
          <p className="text-3xl font-bold">{stats.reportsAnalyzed}</p>
        </div>
        <div className="bg-yellow-500 text-white p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold mb-2">Last Risk Level</h3>
          <p className="text-3xl font-bold">{stats.lastRiskLevel}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Prediction Page ──────────────────────────────────────────────────────────
function PredictionPage() {
  const [formData, setFormData] = useState({
    age: '', bmi: '', glucose: '', insulin: '', homa: '',
    leptin: '', adiponectin: '', resistin: '', mcp1: '',
    smoking_status: 0, alcohol_units: 0, exercise_hours: 0,
    diet_quality: 5, family_history: 0
  });
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handlePredict = async () => {
    setLoading(true); setError('');
    try {
      const data = await PredictionAPI.predict({
        age: parseFloat(formData.age), bmi: parseFloat(formData.bmi),
        glucose: parseFloat(formData.glucose), insulin: parseFloat(formData.insulin),
        homa: parseFloat(formData.homa), leptin: parseFloat(formData.leptin),
        adiponectin: parseFloat(formData.adiponectin), resistin: parseFloat(formData.resistin),
        mcp1: parseFloat(formData.mcp1), smoking_status: parseInt(formData.smoking_status),
        alcohol_units: parseFloat(formData.alcohol_units), exercise_hours: parseFloat(formData.exercise_hours),
        diet_quality: parseFloat(formData.diet_quality), family_history: parseInt(formData.family_history),
      });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Prediction failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-4xl font-bold mb-8">Breast Cancer Risk Prediction</h1>
      {error && <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">{error}</div>}
      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-6">Patient Information</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[['age','Age'],['bmi','BMI'],['glucose','Glucose (mg/dL)'],['insulin','Insulin (µU/mL)'],
              ['homa','HOMA'],['leptin','Leptin (ng/mL)'],['adiponectin','Adiponectin (µg/mL)'],
              ['resistin','Resistin (ng/mL)'],['mcp1','MCP.1 (pg/mL)']].map(([field, label]) => (
              <div key={field}>
                <label className="block text-sm font-medium mb-1">{label}</label>
                <input type="number" step="0.1" value={formData[field]}
                  onChange={(e) => setFormData(p => ({ ...p, [field]: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none" />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium mb-1">Family History</label>
              <select value={formData.family_history}
                onChange={(e) => setFormData(p => ({ ...p, family_history: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none">
                <option value={0}>No</option><option value={1}>Yes</option>
              </select>
            </div>
          </div>
          <button onClick={handlePredict} disabled={loading}
            className="w-full mt-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50">
            {loading ? 'Analyzing...' : 'Predict Risk'}
          </button>
        </div>

        {result?.prediction && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg">
              <h2 className="text-2xl font-bold mb-4">Prediction Results</h2>
              <div className={`p-6 rounded-lg border-2 mb-4 ${
                result.prediction.risk_level === 'High Risk'   ? 'bg-red-100 border-red-500' :
                result.prediction.risk_level === 'Medium Risk' ? 'bg-orange-100 border-orange-500' :
                                                                  'bg-green-100 border-green-500'}`}>
                <p className="text-sm text-gray-600 mb-2">Cancer Probability</p>
                <p className="text-4xl font-bold">{(result.prediction.probability * 100).toFixed(1)}%</p>
                <p className="text-xl font-semibold mt-2">{result.prediction.risk_level}</p>
              </div>
              {result.explanation?.top_features?.map((f, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b">
                  <span>{f.feature}</span><span className="text-sm text-gray-600">{f.direction}</span>
                </div>
              ))}
            </div>
            {result.prediction.recommendations && (
              <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-2xl font-bold mb-4">Recommendations</h2>
                {result.prediction.recommendations.map((rec, i) => (
                  <div key={i} className="flex space-x-3 mb-4">
                    <span className="text-2xl">{rec.icon || '💡'}</span>
                    <div><h4 className="font-bold">{rec.title}</h4><p className="text-sm text-gray-600">{rec.description}</p></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Summarizer Page ──────────────────────────────────────────────────────────
function SummarizerPage() {
  const [fileName, setFileName] = useState('');
  const [summary, setSummary]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [file, setFile]         = useState(null);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) { setFileName(f.name); setFile(f); setError(''); }
  };

  const handleAnalyze = async () => {
    if (!file) { setError('Please select a file first'); return; }
    setLoading(true); setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await ReportAPI.upload(formData);
      setSummary(data);
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-8">Medical Report Summarizer</h1>
      {error && <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">{error}</div>}

      <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
        <h2 className="text-2xl font-bold mb-4">Upload Report</h2>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="mb-4">Upload PDF or Image (PNG, JPG)</p>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileChange} className="hidden" id="file-input" />
          <label htmlFor="file-input" className="px-6 py-2 bg-purple-600 text-white rounded-lg cursor-pointer hover:bg-purple-700 inline-block">
            Choose File
          </label>
          {fileName && <p className="mt-4 text-sm text-green-600">✓ {fileName}</p>}
        </div>
        <button onClick={handleAnalyze} disabled={!fileName || loading}
          className="w-full mt-4 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50">
          {loading ? 'Processing...' : 'Generate Summary'}
        </button>
      </div>

      {summary && (
        <div className="space-y-6">

          {/* 1 ── Executive Summary */}
          <div className="bg-white p-6 rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold mb-4">Executive Summary</h2>
            <p className="text-gray-700 leading-relaxed">{summary.summary}</p>
          </div>

          {/* 2 ── Key Findings */}
          {summary.key_findings?.length > 0 && (
            <div className="bg-white p-6 rounded-xl shadow-lg">
              <h2 className="text-2xl font-bold mb-4">Key Findings</h2>
              <div className="space-y-2">
                {summary.key_findings.map((finding, i) => (
                  <div key={i} className="flex items-start space-x-2">
                    <span className="text-green-600 mt-1 font-bold">✓</span>
                    <span>{finding}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3 ── Medical Terms Explained */}
          {summary.medical_terms_explained?.length > 0 && (
            <div className="bg-white p-6 rounded-xl shadow-lg">
              <h2 className="text-2xl font-bold mb-4">Medical Terms Explained</h2>
              <div className="space-y-4">
                {summary.medical_terms_explained.map((term, i) => (
                  <div key={i} className="border-l-4 border-purple-300 pl-4">
                    <h3 className="font-bold text-purple-700">{term.term}</h3>
                    <p className="text-gray-600 text-sm mt-1">{term.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4 ── Risk Indicators */}
          {summary.risk_indicators?.length > 0 && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded-r-xl">
              <h2 className="text-xl font-bold mb-3 flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <span>Risk Indicators</span>
              </h2>
              <div className="space-y-2">
                {summary.risk_indicators.map((risk, i) => (
                  <div key={i} className="text-gray-700">⚠️ {risk}</div>
                ))}
              </div>
            </div>
          )}

          {/* 5 ── Recommended Actions */}
          {summary.recommended_actions?.length > 0 && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-xl">
              <h2 className="text-xl font-bold mb-3 flex items-center space-x-2">
                <Activity className="w-5 h-5 text-blue-600" />
                <span>Recommended Actions</span>
              </h2>
              <div className="space-y-2">
                {summary.recommended_actions.map((action, i) => (
                  <div key={i} className="text-gray-700">• {action}</div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ─── History Page ─────────────────────────────────────────────────────────────
function HistoryPage() {
  const [predictions, setPredictions] = useState([]);
  const [reports, setReports]         = useState([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const [preds, reps] = await Promise.all([PredictionAPI.history(), ReportAPI.history()]);
        setPredictions(Array.isArray(preds) ? preds : []);
        setReports(reps.reports || []);
      } catch (err) {
        console.error('History error:', err);
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, []);

  if (loading) return <div className="text-center py-20 text-gray-500">Loading history...</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-4xl font-bold mb-8">History</h1>
      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-4">Prediction History</h2>
          {predictions.length === 0
            ? <p className="text-gray-500 text-center py-4">No predictions yet</p>
            : predictions.map((pred, i) => (
              <div key={i} className="p-4 border rounded-lg hover:shadow-md transition mb-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{new Date(pred.created_at).toLocaleDateString()}</p>
                    <p className="text-sm text-gray-600">
                      {pred.prediction?.risk_level}
                      {pred.prediction?.probability && ` (${(pred.prediction.probability * 100).toFixed(0)}%)`}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-sm ${
                    pred.prediction?.risk_level === 'High Risk'   ? 'bg-red-100 text-red-800' :
                    pred.prediction?.risk_level === 'Medium Risk' ? 'bg-orange-100 text-orange-800' :
                                                                     'bg-green-100 text-green-800'}`}>
                    {pred.prediction?.risk_level || 'Unknown'}
                  </span>
                </div>
              </div>
            ))}
        </div>
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-4">Report History</h2>
          {reports.length === 0
            ? <p className="text-gray-500 text-center py-4">No reports analyzed yet</p>
            : reports.map((r, i) => (
              <div key={i} className="p-4 border rounded-lg hover:shadow-md transition mb-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold">Report #{r.id}</p>
                    <p className="text-sm text-gray-600">{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
