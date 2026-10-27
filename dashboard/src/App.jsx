import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import KpiCards from './components/KpiCards';
import LabUsageChart from './components/LabUsageChart';
import LabMatrix from './components/LabMatrix';
import QuickActions from './components/QuickActions';
import PcDetailModal from './components/PcDetailModal';
import CommandModal from './components/CommandModal';
import ScheduleView from './components/ScheduleView';
import AuditLogView from './components/AuditLogView';
import LoginPage from './components/LoginPage';
import { sectionContainerVariant, itemFadeUpVariant } from './motion';
import { api, getStoredToken, getStoredUser } from './api';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(getStoredUser());
  const [isAuthenticated, setIsAuthenticated] = useState(!!getStoredToken());
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'devices' | 'schedules' | 'logs' | 'lab_detail'
  
  // Labs & PCs State
  const [labs, setLabs] = useState([]);
  const [selectedLabId, setSelectedLabId] = useState(1);
  const [pcs, setPcs] = useState([]);
  const [selectedPcIds, setSelectedPcIds] = useState([]);
  
  // Modals & Notifications
  const [activePcDetailId, setActivePcDetailId] = useState(null);
  const [commandModalConfig, setCommandModalConfig] = useState(null); // { isOpen, targetType, targetId, action }
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toastMessage, setToastMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAutoSync, setIsAutoSync] = useState(true);

  // Initialize data
  useEffect(() => {
    fetchInitialData();

    // Listen for 401 unauthorized
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setUser(null);
    };
    window.addEventListener('simlab:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('simlab:unauthorized', handleUnauthorized);
  }, [isAuthenticated]);

  // When selectedLabId changes or on activeTab change, load PCs
  useEffect(() => {
    if (selectedLabId) {
      fetchLabPcs(selectedLabId);
    }
  }, [selectedLabId]);

  // Smart polling interval for live real-time sync (Phase 2)
  useEffect(() => {
    if (!isAutoSync) return;

    const interval = setInterval(() => {
      // Pause polling if tab is in background or hidden
      if (document.hidden || document.visibilityState === 'hidden') return;

      if (selectedLabId) {
        api.getLabPcs(selectedLabId)
          .then((res) => {
            if (res?.data) {
              setPcs(res.data);
            }
          })
          .catch(() => {});
      }

      api.getUnreadCount()
        .then((res) => {
          if (res?.unread_count !== undefined) setUnreadCount(res.unread_count);
        })
        .catch(() => {});
    }, 4000);

    return () => clearInterval(interval);
  }, [isAutoSync, selectedLabId]);

  const fetchInitialData = async () => {
    try {
      const [labsRes, notifRes, unreadRes, meRes] = await Promise.all([
        api.getLabs().catch(() => null),
        api.getNotifications().catch(() => null),
        api.getUnreadCount().catch(() => null),
        api.getMe().catch(() => null),
      ]);

      if (labsRes?.data) setLabs(labsRes.data);
      if (notifRes?.data) setNotifications(notifRes.data);
      if (unreadRes?.unread_count !== undefined) setUnreadCount(unreadRes.unread_count);
      if (meRes) setUser(meRes);
    } catch (err) {
      console.error('Error fetching initial data:', err);
    }
  };

  const fetchLabPcs = async (labId) => {
    try {
      const res = await api.getLabPcs(labId);
      if (res?.data) {
        setPcs(res.data);
        setSelectedPcIds([]);
      }
    } catch (err) {
      console.error('Error fetching PCs:', err);
    }
  };

  const showToast = (text, type = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Selection handlers
  const handleToggleSelectPc = (id) => {
    setSelectedPcIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSelectAllPcs = (ids) => {
    setSelectedPcIds(ids);
  };

  const handleClearSelectPcs = () => {
    setSelectedPcIds([]);
  };

  // Command handlers
  const handleTriggerQuickAction = (actionId) => {
    if (actionId === 'message') {
      setCommandModalConfig({
        isOpen: true,
        targetType: selectedPcIds.length > 0 ? 'pc' : 'lab',
        targetId: selectedPcIds.length > 0 ? selectedPcIds[0] : selectedLabId,
        action: 'message',
      });
      return;
    }

    // Direct command dispatch
    const payload = {
      action: actionId,
      target_type: selectedPcIds.length > 0 ? 'pc' : 'lab',
      target_id: selectedPcIds.length > 0 ? selectedPcIds[0] : selectedLabId,
      reason: 'Aksi cepat tombol toolbar',
    };

    api.dispatchCommand(payload)
      .then(() => {
        showToast(`Perintah ${actionId} berhasil disiarkan!`);
        fetchLabPcs(selectedLabId);
      })
      .catch((err) => {
        showToast(err.message || 'Gagal mengirim perintah', 'error');
      });
  };

  const handleSinglePcCommand = (pcId, actionId) => {
    api.dispatchCommand({
      action: actionId,
      target_type: 'pc',
      target_id: pcId,
      reason: 'Aksi per PC dari modal detail',
    })
      .then(() => {
        showToast(`Perintah ${actionId} pada PC #${pcId} terkirim.`);
        setActivePcDetailId(null);
        fetchLabPcs(selectedLabId);
      })
      .catch((err) => {
        showToast(err.message || 'Gagal eksekusi', 'error');
      });
  };

  const handleLogout = async () => {
    await api.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setIsAuthenticated(true);
    fetchInitialData();
  };

  // Calculate totals
  const totalPcs = labs.reduce((sum, l) => sum + (l.pcs_count || 30), 0) || 180;
  const onlineCount = labs.reduce((sum, l) => sum + (l.online_count || 28), 0) || 166;
  const offlineCount = Math.max(0, totalPcs - onlineCount);

  // Filtered PCs for search
  const filteredPcs = searchQuery.trim()
    ? pcs.filter((pc) =>
        (pc.hostname || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (pc.ip_address || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (pc.mac_address || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : pcs;

  // If not authenticated, render dedicated LoginPage (full screen, clean)
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex bg-[#fafafa] min-h-screen font-sans text-zinc-900 antialiased selection:bg-zinc-900 selection:text-white">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedLabId={selectedLabId}
        setSelectedLabId={setSelectedLabId}
        labs={labs}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          user={user}
          onLogout={handleLogout}
          notifications={notifications}
          unreadCount={unreadCount}
          onRefreshNotifications={fetchInitialData}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isAutoSync={isAutoSync}
          onToggleAutoSync={setIsAutoSync}
        />

        <main className="p-8 max-w-7xl w-full mx-auto space-y-8 flex-1">
          {/* Toast Alert Banner */}
          {toastMessage && (
            <div className={`p-4 rounded-2xl text-xs font-semibold flex items-center gap-2 shadow-lg ${
              toastMessage.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }`}>
              {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{toastMessage.text}</span>
            </div>
          )}

          {/* VIEW: OVERVIEW / DASHBOARD */}
          {activeTab === 'overview' && (
            <motion.div
              variants={sectionContainerVariant}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="space-y-8"
            >
              {/* Heading Section */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">Ringkasan Sistem</h1>
                  <p className="text-xs text-zinc-500 mt-1 font-mono">
                    Telemetri terpusat, pengawasan node workstation, dan kontrol daya otomatis.
                  </p>
                </div>
              </div>

              {/* KPI Cards Row (Level 2 Stagger inside section) */}
              <KpiCards
                totalPcs={totalPcs}
                onlineCount={onlineCount}
                offlineCount={offlineCount}
              />

              {/* Bar Chart Section */}
              <motion.div variants={itemFadeUpVariant}>
                <LabUsageChart />
              </motion.div>

              {/* Quick Actions Toolbar */}
              <motion.div variants={itemFadeUpVariant}>
                <QuickActions
                  onTriggerAction={handleTriggerQuickAction}
                  selectedCount={selectedPcIds.length}
                />
              </motion.div>

              {/* Interactive Lab Matrix Grid */}
              <motion.div variants={itemFadeUpVariant}>
                <LabMatrix
                  labs={labs}
                  selectedLabId={selectedLabId}
                  onSelectLab={(id) => setSelectedLabId(id)}
                  pcs={filteredPcs}
                  onOpenPcDetail={(id) => setActivePcDetailId(id)}
                  selectedPcIds={selectedPcIds}
                  onToggleSelectPc={handleToggleSelectPc}
                  onSelectAllPcs={handleSelectAllPcs}
                  onClearSelectPcs={handleClearSelectPcs}
                  onOpenCommandModal={() => {
                    setCommandModalConfig({
                      isOpen: true,
                      targetType: 'pc',
                      targetId: selectedPcIds[0],
                      action: 'message',
                    });
                  }}
                />
              </motion.div>
            </motion.div>
          )}

          {/* VIEW: LAB DETAIL / PERANGKAT */}
          {(activeTab === 'devices' || activeTab === 'lab_detail') && (
            <motion.div
              variants={sectionContainerVariant}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">
                  Node Workstation
                </h1>
                <p className="text-xs text-zinc-500 mt-1 font-mono">
                  Pengawasan langsung metrik perangkat keras dan status jaringan per node.
                </p>
              </div>

              <QuickActions
                onTriggerAction={handleTriggerQuickAction}
                selectedCount={selectedPcIds.length}
              />

              <LabMatrix
                labs={labs}
                selectedLabId={selectedLabId}
                onSelectLab={(id) => setSelectedLabId(id)}
                pcs={filteredPcs}
                onOpenPcDetail={(id) => setActivePcDetailId(id)}
                selectedPcIds={selectedPcIds}
                onToggleSelectPc={handleToggleSelectPc}
                onSelectAllPcs={handleSelectAllPcs}
                onClearSelectPcs={handleClearSelectPcs}
                onOpenCommandModal={() => {
                  setCommandModalConfig({
                    isOpen: true,
                    targetType: 'pc',
                    targetId: selectedPcIds[0],
                    action: 'message',
                  });
                }}
              />
            </motion.div>
          )}

          {/* VIEW: JADWAL DAYA */}
          {activeTab === 'schedules' && (
            <motion.div
              variants={sectionContainerVariant}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <ScheduleView selectedLabId={selectedLabId} labs={labs} />
            </motion.div>
          )}

          {/* VIEW: LOG AKTIVITAS */}
          {activeTab === 'logs' && (
            <motion.div
              variants={sectionContainerVariant}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <AuditLogView />
            </motion.div>
          )}
        </main>
      </div>

      {/* PC Detail Modal */}
      <PcDetailModal
        pcId={activePcDetailId}
        onClose={() => setActivePcDetailId(null)}
        onDispatchSingleCommand={handleSinglePcCommand}
      />

      {/* Remote Command Modal */}
      {commandModalConfig && (
        <CommandModal
          isOpen={commandModalConfig.isOpen}
          onClose={() => setCommandModalConfig(null)}
          targetType={commandModalConfig.targetType}
          targetId={commandModalConfig.targetId}
          initialAction={commandModalConfig.action}
          onSuccess={() => {
            showToast('Perintah berhasil didisposisikan ke broker MQTT');
            fetchLabPcs(selectedLabId);
          }}
        />
      )}
    </div>
  );
}
