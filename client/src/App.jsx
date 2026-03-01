import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import MealLog from './pages/MealLog';
import Goals from './pages/Goals';
import Preferences from './pages/Preferences';
import Sharing from './pages/Sharing';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import WeightLog from './pages/WeightLog';
import Reports from './pages/Reports';
import Challenges from './pages/Challenges';
import Messages from './pages/Messages';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<Navbar />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/log" element={<MealLog />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/preferences" element={<Preferences />} />
              <Route path="/sharing" element={<Sharing />} />
              <Route path="/weight" element={<WeightLog />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/challenges" element={<Challenges />} />
              <Route path="/messages" element={<Messages />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
