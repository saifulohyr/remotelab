import React, { useState, useEffect, useRef } from 'react';
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
import { api, getStoredUser, hasValidSession, DEMO_MODE } from './api';
import { buildCommandPayload } from './commands';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(getStoredUser());
  const [isAuthenticated, setIsAuthenticated] = useState(hasValidSession());
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
  const [dataError, setDataError] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const selectedLabRef = useRef(selectedLabId);
  const toastTimerRef = useRef(null);
  selectedLabRef.current = selectedLabId;

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setUser(null);
      setLabs([]);
      setPcs([]);
      setSelectedPcIds([]);
    };
    window.addEventListener('simlab:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('simlab:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchInitialData();
  }, [isAuthenticated]);

  // When selectedLabId changes or on activeTab change, load PCs
  useEffect(() => {
    setSelectedPcIds([]);
    if (isAuthenticated && selectedLabId) fetchLabPcs(selectedLabId);
  }, [selectedLabId, isAuthenticated]);

  // Smart polling interval for live real-time sync (Phase 2)
  useEffect(() => {
    if (!isAutoSync || !isAuthenticated) return;

    const interval = setInterval(() => {
      // Pause polling if tab is in background or hidden
      if (document.hidden || document.visibilityState === 'hidden') return;

      if (selectedLabId) {
        api.getLabPcs(selectedLabId)
          .then((res) => {
            if (res?.data && selectedLabRef.current === selectedLabId) {
              setPcs(res.data);
              setSyncError(null);
            }
          })
          .catch((err) => setSyncError(err.message || 'Sinkronisasi PC gagal.'));
      }

      api.getUnreadCount()
        .then((res) => {
          if (res?.count !== undefined) setUnreadCount(res.count);
        })
        .catch(() => {});
    }, 4000);

    return () => clearInterval(interval);
  }, [isAutoSync, selectedLabId, isAuthenticated]);

  const fetchInitialData = async () => {
    try {
      const [labsRes, notifRes, unreadRes, meRes] = await Promise.all([
        api.getLabs(),
        api.getNotifications(),
        api.getUnreadCount(),
        api.getMe(),
      ]);

      if (labsRes?.data) setLabs(labsRes.data);
      if (notifRes?.data) setNotifications(notifRes.data);
      if (unreadRes?.count !== undefined) setUnreadCount(unreadRes.count);
      if (meRes) setUser(meRes.data || meRes);
      setDataError(null);
    } catch (err) {
      setDataError(err.message || 'Gagal memuat data dashboard.');
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
      if (selectedLabRef.current === labId) setDataError(err.message || 'Gagal memuat daftar PC.');
    }
  };

  const showToast = (text, type = 'success') => {
    setToastMessage({ text, type });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
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
    if (actionId === 'message' || actionId === 'run_script') {
      setCommandModalConfig({
        isOpen: true,
        targetType: selectedPcIds.length > 0 ? 'pc' : 'lab',
        targetId: selectedPcIds.length > 0 ? selectedPcIds[0] : selectedLabId,
        pcIds: selectedPcIds.length > 0 ? selectedPcIds : undefined,
        action: actionId,
      });
      return;
    }

    // Direct command dispatch
    let payload;
    try {
      payload = buildCommandPayload({
        action: actionId,
        targetType: selectedPcIds.length > 0 ? 'pc' : 'lab',
        targetId: selectedPcIds.length > 0 ? selectedPcIds[0] : selectedLabId,
        pcIds: selectedPcIds.length > 0 ? selectedPcIds : undefined,
        reason: 'Aksi cepat tombol toolbar',
      });
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }

    api.dispatchCommand(payload)
      .then(() => {
        showToast(`Perintah ${actionId} diterima server; menunggu ACK node.`);
        fetchLabPcs(selectedLabId);
      })
      .catch((err) => {
        showToast(err.message || 'Gagal mengirim perintah', 'error');
      });
  };

  const handleSinglePcCommand = (pcId, actionId) => {
    if (actionId === 'run_script') {
      setActivePcDetailId(null);
      setCommandModalConfig({
        isOpen: true,
        targetType: 'pc',
        targetId: pcId,
        action: 'run_script',
      });
      return;
    }

    api.dispatchCommand({
      action: actionId,
      target_type: 'pc',
      target_id: pcId,
      reason: 'Aksi per PC dari modal detail',
    })
      .then(() => {
        showToast(`Perintah ${actionId} pada PC #${pcId} diterima; menunggu ACK.`);
        setActivePcDetailId(null);
        fetchLabPcs(selectedLabId);
      })
      .catch((err) => {
        showToast(err.message || 'Gagal eksekusi', 'error');
      });
  };

  const handleDeletePc = async (pcId) => {
    const res = await api.deletePc(pcId);
    setActivePcDetailId(null);
    setSelectedPcIds((prev) => prev.filter((id) => id !== pcId));
    showToast(res?.message || 'PC berhasil dihapus.');
    fetchLabPcs(selectedLabId);
    fetchInitialData();
  };

  const handleLogout = async () => {
    await api.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setIsAuthenticated(true);
  };

  // Calculate totals from live data (no faked fallbacks)
  const totalPcs = labs.reduce((sum, l) => sum + (Number(l.pcs_count) || 0), 0);
  const onlineCount = labs.reduce((sum, l) => sum + (Number(l.online_count) || 0), 0);
  const offlineCount = labs.reduce((sum, l) => sum + (Number(l.offline_count) || 0), 0);
  const warningCount = labs.reduce((sum, l) => sum + ((Number(l.booting_count) || 0) + (Number(l.wake_failed_count) || 0)), 0);

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
          {DEMO_MODE && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              MODE DEMO — data dan operasi tidak terhubung ke backend produksi.
            </div>
          )}
          {(dataError || syncError) && (
            <div role="alert" className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {dataError || syncError}
            </div>
          )}
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
                warningCount={warningCount}
              />

              {/* Bar Chart Section */}
              <motion.div variants={itemFadeUpVariant}>
                <LabUsageChart onlineCount={onlineCount} />
              </motion.div>

              {/* Quick Actions Toolbar */}
              <motion.div variants={itemFadeUpVariant}>
                <QuickActions
                  onTriggerAction={handleTriggerQuickAction}
                  selectedCount={selectedPcIds.length}
                  onlineCount={onlineCount}
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
                      pcIds: selectedPcIds,
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
                onOpenCommandModal={(preset) => {
                  setCommandModalConfig({
                    isOpen: true,
                    targetType: preset?.target_type || (selectedPcIds.length > 0 ? 'pc' : 'lab'),
                    targetId: preset?.target_id || (selectedPcIds.length > 0 ? selectedPcIds[0] : selectedLabId),
                    action: preset?.action || (selectedPcIds.length > 0 ? 'message' : 'wake'),
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
        onDeletePc={handleDeletePc}
      />

      {/* Remote Command Modal */}
      {commandModalConfig && (
        <CommandModal
          isOpen={commandModalConfig.isOpen}
          onClose={() => setCommandModalConfig(null)}
          targetType={commandModalConfig.targetType}
          targetId={commandModalConfig.targetId}
          pcIds={commandModalConfig.pcIds}
          initialAction={commandModalConfig.action}
          onSuccess={() => {
            showToast('Perintah diterima server; menunggu hasil ACK node.');
            fetchLabPcs(selectedLabId);
          }}
        />
      )}
    </div>
  );
}
