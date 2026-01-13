import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { dismissNotification, markNotificationLeaving } from '../store/slices/uiSlice';

export default function NotificationCenter() {
  const dispatch = useDispatch();
  const { notifications } = useSelector(s => s.ui);

  useEffect(() => {
    notifications.forEach(n => {
      if (!n.leaving && !n._timer) {
        const timer = setTimeout(() => {
          dispatch(markNotificationLeaving(n.id));
          setTimeout(() => dispatch(dismissNotification(n.id)), 320);
        }, 4000);
        n._timer = timer;
      }
    });
  }, [notifications]);

  if (notifications.length === 0) return null;

  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: "'Syne', sans-serif" }}>
      {notifications.map(n => (
        <div key={n.id} style={{
          background: '#111118',
          border: `1px solid ${n.type === 'success' ? 'rgba(61,255,160,0.4)' : n.type === 'error' ? 'rgba(255,83,112,0.4)' : 'rgba(124,106,247,0.4)'}`,
          borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
          animation: n.leaving ? 'slideOutRight 0.3s ease forwards' : 'slideInRight 0.3s ease',
          minWidth: 260, maxWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: n.type === 'success' ? '#3dffa0' : n.type === 'error' ? '#ff5370' : '#7c6af7' }} />
          <span style={{ fontSize: 13, color: '#e2e2f0', flex: 1 }}>{n.message}</span>
          <button onClick={() => dispatch(dismissNotification(n.id))} style={{ background: 'none', border: 'none', color: '#6e6e8f', cursor: 'pointer', fontSize: 14, padding: 2 }}>✕</button>
        </div>
      ))}
    </div>
  );
}
