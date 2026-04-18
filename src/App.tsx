/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, ReactNode } from 'react';
import { 
  TrendingUp, 
  User as UserIcon, 
  ShoppingCart, 
  Plus, 
  Minus, 
  ChevronDown,
  LayoutDashboard,
  Package,
  History,
  BarChart3,
  Download,
  Edit2,
  Trash2,
  X,
  Upload,
  Image as ImageIcon,
  LogOut,
  LogIn,
  ArrowLeft,
  Camera,
  ChevronRight,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  handleFirestoreError,
  OperationType
} from './firebase';

interface Product {
  id: string;
  name: string;
  price: number; 
  stock: number;
  image: string;
  category: string;
  userId: string;
}

const PRODUCT_CATEGORIES = ['Bats', 'Accessories', 'Jerseys', 'Other'];

interface DailyData {
  day: string;
  revenue: number;
}

interface Sale {
  id: string;
  productId: string;
  productName: string;
  price: number;
  basePrice: number;
  quantity: number;
  timestamp: string; // ISO string for Firestore
  userId: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      if (this.state.error?.message) {
        try {
          const parsedError = JSON.parse(this.state.error.message);
          if (parsedError.error) errorMessage = parsedError.error;
        } catch (e) {
          errorMessage = this.state.error.message;
        }
      }

      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
          <div className="w-20 h-20 bg-rose-100 rounded-3xl flex items-center justify-center mb-6">
            <X className="w-10 h-10 text-rose-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">Oops!</h1>
          <p className="text-slate-500 mb-8 max-w-xs">{errorMessage}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold active:scale-95 transition-all"
          >
            Reload App
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <InventoryApp />
    </ErrorBoundary>
  );
}

function InventoryApp() {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return localStorage.getItem('isAdmin') === 'true';
  });
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  const [products, setProducts] = useState<Product[]>([]);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [logPrice, setLogPrice] = useState<number>(0);
  const [logQuantity, setLogQuantity] = useState<number>(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';

  // Firestore Listeners
  useEffect(() => {
    if (!isAdmin) {
      setProducts([]);
      setSales([]);
      setDailyData([]);
      return;
    }

    // Use 'admin' as the hardcoded userId for single-user setup
    const userId = 'admin';

    const productsQuery = query(collection(db, 'products'), where('userId', '==', userId));
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(items);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'products'));

    const salesQuery = query(collection(db, 'sales'), where('userId', '==', userId));
    const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
      // Sort by timestamp descending
      const sortedSales = items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setSales(sortedSales);

      // Calculate daily data for the chart based on sales
      const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toDateString();
      }).reverse();

      const chartData = last7Days.map(dateStr => {
        const dayRevenue = items
          .filter(s => new Date(s.timestamp).toDateString() === dateStr)
          .reduce((sum, s) => sum + s.price, 0);
        return {
          day: new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' }),
          revenue: dayRevenue
        };
      });
      setDailyData(chartData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sales'));

    return () => {
      unsubscribeProducts();
      unsubscribeSales();
    };
  }, [isAdmin]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAdmin(true);
      localStorage.setItem('isAdmin', 'true');
      setLoginError('');
    } else {
      setLoginError('Incorrect password');
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    localStorage.removeItem('isAdmin');
  };

  const handleUpdateStock = async (id: string, delta: number) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    try {
      await updateDoc(doc(db, 'products', id), {
        stock: Math.max(0, product.stock + delta)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${id}`);
    }
  };

  const handleLogSale = async () => {
    if (!selectedProductId || !isAdmin || logQuantity < 1) return;
    
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    if (product.stock < logQuantity) {
      alert(`Insufficient stock. Only ${product.stock} items remaining.`);
      return;
    }

    try {
      const saleData = {
        productId: selectedProductId,
        productName: product.name,
        price: logPrice * logQuantity,
        basePrice: product.price || 0,
        quantity: logQuantity,
        timestamp: new Date().toISOString(),
        userId: 'admin'
      };
      await addDoc(collection(db, 'sales'), saleData);
      await handleUpdateStock(selectedProductId, -logQuantity);
      
      setSelectedProductId('');
      setLogPrice(0);
      setLogQuantity(1);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'sales');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setIsSaving(true);
    const productData = {
      name: formData.name,
      price: Number(formData.price),
      stock: Number(formData.stock),
      image: formData.image || 'https://picsum.photos/seed/product/400/400',
      category: formData.category || 'Other',
      userId: 'admin'
    };

    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), productData);
      } else {
        await addDoc(collection(db, 'products'), productData);
      }
      closeModal();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert('Failed to save product: ' + errorMessage);
      console.error('Save Product Error:', error);
      handleFirestoreError(error, OperationType.WRITE, 'products');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteDoc(doc(db, 'products', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
      }
    }
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
  const [isLowStockModalOpen, setIsLowStockModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeProductActionId, setActiveProductActionId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    stock: '',
    image: '',
    category: 'Other'
  });

  // Browser History API: allow hardware back button / swipe gesture to close modals
  const anyModalOpen = isModalOpen || isSalesModalOpen || isLowStockModalOpen;

  useEffect(() => {
    if (!anyModalOpen) return;

    // Push a dummy state so "back" pops this instead of leaving
    window.history.pushState({ modal: true }, '');

    const handlePopState = () => {
      // Close whichever modal is open
      if (isModalOpen) setIsModalOpen(false);
      if (isSalesModalOpen) setIsSalesModalOpen(false);
      if (isLowStockModalOpen) setIsLowStockModalOpen(false);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [anyModalOpen]);

  // Helper: close modal AND clean up the pushed history entry
  const closeModal = () => {
    if (anyModalOpen) {
      window.history.back(); // This pops the dummy state we pushed
    }
  };

  const salesToday = useMemo(() => {
    const today = new Date().toDateString();
    return sales
      .filter(s => new Date(s.timestamp).toDateString() === today)
      .reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  }, [sales]);

  const dailyProfit = useMemo(() => {
    const today = new Date().toDateString();
    return sales
      .filter(s => new Date(s.timestamp).toDateString() === today)
      .reduce((sum, s) => {
        const salePrice = Number(s.price) || 0;
        const saleBasePrice = Number(s.basePrice) || 0;
        const saleQuantity = Number(s.quantity) || 1;
        return sum + (salePrice - (saleBasePrice * saleQuantity));
      }, 0);
  }, [sales]);

  const totalRevenue = useMemo(() => dailyData.reduce((acc, curr) => acc + curr.revenue, 0), [dailyData]);
  const lowStockCount = useMemo(() => products.filter(p => p.stock < 5).length, [products]);
  const filteredProducts = useMemo(() => {
    if (categoryFilter === 'All') return products;
    return products.filter(p => p.category === categoryFilter);
  }, [products, categoryFilter]);

  const handleSelectProduct = (id: string) => {
    setSelectedProductId(id);
    const product = products.find(p => p.id === id);
    if (product) {
      setLogPrice(product.price);
    }
  };

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        price: product.price.toString(),
        stock: product.stock.toString(),
        image: product.image,
        category: product.category || 'Other'
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        price: '',
        stock: '',
        image: '',
        category: 'Other'
      });
    }
    setFormStep(1);
    setIsModalOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_SIZE = 800; // max width or height

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setFormData(prev => ({ ...prev, image: dataUrl }));
        };
        if (event.target?.result) {
          img.src = event.target.result as string;
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDownloadData = (period: 'daily' | 'weekly' | 'monthly') => {
    const doc = new jsPDF();
    const now = new Date();
    const timestamp = now.toLocaleString();
    const dateStr = now.toISOString().split('T')[0];
    
    // Determine start of period (calendar-based)
    const startTime = new Date();
    let endTime = new Date();
    let periodLabel = '';

    if (period === 'daily') {
      startTime.setHours(0, 0, 0, 0);
      endTime = now;
      periodLabel = `TODAY — ${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    } else if (period === 'weekly') {
      // Current calendar week: go back to the most recent Saturday (week start)
      const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
      const diffToSat = dayOfWeek >= 6 ? 0 : dayOfWeek + 1; // days since last Saturday
      startTime.setDate(now.getDate() - diffToSat);
      startTime.setHours(0, 0, 0, 0);
      // End of week = Friday after the start Saturday
      endTime = new Date(startTime);
      endTime.setDate(startTime.getDate() + 6);
      endTime.setHours(23, 59, 59, 999);
      periodLabel = 'THIS WEEK';
    } else if (period === 'monthly') {
      // Current calendar month: 1st of this month to last day of this month
      startTime.setDate(1);
      startTime.setHours(0, 0, 0, 0);
      endTime = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      periodLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
    }

    const filteredSales = sales.filter(s => {
      const t = new Date(s.timestamp);
      return t >= startTime && t <= endTime;
    });
    const filename = `inventory_${period}_report_${dateStr}.pdf`;

    // Premium Header
    doc.setFontSize(22);
    doc.setTextColor(109, 40, 217); // Violet-700
    doc.setFont('helvetica', 'bold');
    doc.text('SOLID INVENTORY', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text(`${periodLabel} — PERFORMANCE REPORT`, 14, 30);
    const fromStr = startTime.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const toStr = endTime.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.text(`From: ${fromStr} — To: ${toStr}`, 14, 35);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 40, 196, 40);

    // Table Data
    const tableHeaders = [['Date', 'Time', 'Product', 'Qty', 'Price', 'Profit']];
    const tableData = filteredSales.map(s => {
      const date = new Date(s.timestamp);
      const salePrice = Number(s.price) || 0;
      const saleBasePrice = Number(s.basePrice) || 0;
      const saleQuantity = Number(s.quantity) || 1;
      const profit = salePrice - (saleBasePrice * saleQuantity);
      
      return [
        date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        s.productName,
        saleQuantity,
        `${salePrice.toLocaleString()}`,
        `${profit.toLocaleString()}`
      ];
    });

    if (tableData.length === 0) {
      doc.setFontSize(12);
      doc.setTextColor(148, 163, 184);
      doc.text('No transactions recorded for this period.', 14, 55);
    } else {
      autoTable(doc, {
        startY: 45,
        head: tableHeaders,
        body: tableData,
        theme: 'grid',
        headStyles: { 
          fillColor: [109, 40, 217], // Violet-700
          fontSize: 9,
          fontStyle: 'bold',
          halign: 'center'
        },
        styles: { 
          fontSize: 8,
          cellPadding: 3,
          textColor: [30, 41, 59]
        },
        columnStyles: {
          4: { halign: 'right' },
          5: { halign: 'right', fontStyle: 'bold' }
        },
        alternateRowStyles: { fillColor: [248, 250, 252] }
      });

      // Summary Section
      const finalY = (doc as any).lastAutoTable.finalY + 15;
      const periodRevenue = filteredSales.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
      const periodProfit = filteredSales.reduce((sum, s) => {
        const salePrice = Number(s.price) || 0;
        const saleBasePrice = Number(s.basePrice) || 0;
        const saleQuantity = Number(s.quantity) || 1;
        return sum + (salePrice - (saleBasePrice * saleQuantity));
      }, 0);

      doc.setDrawColor(226, 232, 240);
      doc.line(14, finalY - 5, 196, finalY - 5);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text('REPORT SUMMARY', 14, finalY);
      
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text(`Total Revenue: BDT ${periodRevenue.toLocaleString()}`, 14, finalY + 10);
      
      doc.setTextColor(109, 40, 217);
      doc.text(`Net Profit: BDT ${periodProfit.toLocaleString()}`, 14, finalY + 18);
    }

    doc.save(filename);
  };



  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="w-20 h-20 bg-violet-100 rounded-3xl flex items-center justify-center mb-6">
          <Package className="w-10 h-10 text-violet-600" />
        </div>
        <h1 className="text-3xl font-black text-slate-900 mb-2">Solid Inventory</h1>
        <p className="text-slate-500 mb-8 max-w-xs">Admin Access Required</p>
        
        <form onSubmit={handleLogin} className="w-full max-w-xs space-y-4">
          <div className="relative">
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Admin Password"
              className="w-full bg-white border border-slate-200 py-4 px-4 rounded-2xl focus:ring-2 focus:ring-violet-500 outline-none transition-all"
              autoFocus
            />
          </div>
          {loginError && <p className="text-rose-500 text-xs font-bold">{loginError}</p>}
          <button 
            type="submit"
            className="premium-active w-full bg-slate-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-slate-200"
          >
            <LogIn className="w-5 h-5" />
            Enter Dashboard
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col pb-32">
      {/* Header Section */}
      <header className="px-6 pt-12 pb-4 flex-shrink-0">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Inventory Manager</p>
            <h1 className="text-2xl font-extrabold text-slate-900">Admin Panel</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${products.length > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                Project: {import.meta.env.VITE_FIREBASE_PROJECT_ID || 'local-applet'} • {products.length} Items Loaded
              </p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center border border-violet-200 hover:bg-violet-200 transition-colors"
          >
            <LogOut className="text-violet-600 w-5 h-5" />
          </button>
        </div>

        {/* Profit Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-5 border border-slate-100 status-card-glow mb-4"
        >
          <p className="text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-widest">DAILY NET PROFIT</p>
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black text-slate-900">BDT {dailyProfit.toLocaleString()}</h2>
            <div className="flex items-center bg-emerald-50 px-3 py-1 rounded-full">
              <TrendingUp className="text-emerald-500 w-3 h-3" />
              <span className="text-emerald-500 font-bold text-xs ml-1">12%</span>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsSalesModalOpen(true)}
            className="bg-white rounded-2xl p-4 border border-slate-100 text-left hover:border-violet-200 transition-colors"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">SALES TODAY</p>
            <p className="text-lg font-bold">BDT {salesToday.toLocaleString()}</p>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsLowStockModalOpen(true)}
            className="bg-white rounded-2xl p-4 border border-slate-100 text-left hover:border-rose-200 transition-colors"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">LOW STOCK</p>
            <p className={`text-lg font-bold ${lowStockCount > 0 ? 'text-rose-500' : 'text-slate-900'}`}>
              {lowStockCount} ITEMS
            </p>
          </motion.button>
        </div>

        {/* Total Revenue Card */}
        <div className="bg-violet-600 rounded-2xl p-4 text-white shadow-lg shadow-violet-200 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">TOTAL REVENUE (DAILY)</p>
              <p className="text-2xl font-black">BDT {salesToday.toLocaleString()}</p>
            </div>
            <BarChart3 className="w-8 h-8 opacity-40" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Revenue Trend Chart */}
        <section className="px-6 mb-6">
          <div className="flex flex-col gap-3 mb-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Revenue Trend</h3>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleDownloadData('daily')}
                    className="premium-active flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-1.5 rounded-lg uppercase hover:bg-violet-100 transition-colors border border-violet-100"
                  >
                    <Download className="w-3 h-3" />
                    Daily
                  </button>
                  <button 
                    onClick={() => handleDownloadData('weekly')}
                    className="premium-active flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1.5 rounded-lg uppercase hover:bg-emerald-100 transition-colors border border-emerald-100"
                  >
                    <Download className="w-3 h-3" />
                    Weekly
                  </button>
                  <button 
                    onClick={() => handleDownloadData('monthly')}
                    className="premium-active flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1.5 rounded-lg uppercase hover:bg-amber-100 transition-colors border border-amber-100"
                  >
                    <Download className="w-3 h-3" />
                    Monthly
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="day" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#94a3b8' }} 
                />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    fontSize: '12px'
                  }}
                  formatter={(value: number) => [`BDT ${value.toLocaleString()}`, 'Revenue']}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#8B5CF6" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Sales Entry Section */}
        <section className="px-6 mb-6 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold">Sales Entry</h3>
            <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded uppercase">QUICK LOG</span>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 mb-1 block uppercase tracking-tighter">Product Selection</label>
                <div className="relative">
                  <select 
                    value={selectedProductId}
                    onChange={(e) => handleSelectProduct(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-xl text-sm py-2.5 pl-3 pr-8 focus:ring-1 focus:ring-violet-500 appearance-none"
                  >
                    <option value="">Select Product...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none w-4 h-4" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-slate-400 mb-1 block uppercase tracking-tighter">Price (BDT/Unit)</label>
                  <input 
                    type="number" 
                    value={logPrice || ''}
                    onChange={(e) => setLogPrice(Number(e.target.value))}
                    className="w-full bg-slate-50 border-none rounded-xl text-sm py-2.5 px-3 focus:ring-1 focus:ring-violet-500"
                    placeholder="0"
                  />
                </div>
                <div className="w-1/3">
                  <label className="text-[10px] font-bold text-slate-400 mb-1 block uppercase tracking-tighter">Quantity</label>
                  <input 
                    type="number" 
                    value={logQuantity || ''}
                    onChange={(e) => setLogQuantity(Number(e.target.value))}
                    className="w-full bg-slate-50 border-none rounded-xl text-sm py-2.5 px-3 focus:ring-1 focus:ring-violet-500"
                    placeholder="1"
                    min="1"
                  />
                </div>
              </div>
              <button 
                onClick={handleLogSale}
                disabled={!selectedProductId}
                className="premium-active w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-slate-200 disabled:opacity-50 disabled:shadow-none"
              >
                <ShoppingCart className="w-4 h-4" />
                LOG SALE
              </button>
            </div>
          </div>
        </section>

        {/* Inventory Management Section */}
        <section className="flex-1 flex flex-col min-h-0">
          <div className="px-6 flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold">Inventory Management</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase">{filteredProducts.length} items</span>
          </div>
          {/* Category Filter Chips */}
          <div className="px-6 mb-4 flex gap-2 overflow-x-auto no-scrollbar">
            {['All', ...PRODUCT_CATEGORIES].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`premium-active flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${
                  categoryFilter === cat
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-200'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-4 no-scrollbar">
            <div className="grid grid-cols-2 gap-4">
              {filteredProducts.map((product) => (
                <motion.div 
                  layout
                  key={product.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveProductActionId(activeProductActionId === product.id ? null : product.id)}
                  className="relative group bg-white rounded-2xl overflow-hidden border border-slate-100 premium-shadow transition-all"
                >
                  <div className="aspect-square bg-slate-100 relative overflow-hidden">
                    <img 
                      alt={product.name} 
                      className="object-cover w-full h-full opacity-90" 
                      src={product.image}
                      referrerPolicy="no-referrer"
                    />
                    {/* Hover & Tap Controls */}
                    <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/20 transition-opacity ${activeProductActionId === product.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <div className="flex gap-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateStock(product.id, -1);
                          }}
                          className="w-10 h-10 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                        >
                          <Minus className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateStock(product.id, 1);
                          }}
                          className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenModal(product);
                            setActiveProductActionId(null);
                          }}
                          className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProduct(product.id);
                            setActiveProductActionId(null);
                          }}
                          className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {/* Stock Badge */}
                    <div className="absolute top-2 right-2">
                      <div className={`px-2 py-1 rounded text-[10px] text-white font-bold backdrop-blur-md ${product.stock < 5 ? 'bg-rose-500/80' : 'bg-black/40'}`}>
                        {product.stock < 5 ? `Low: ${product.stock}` : `Stock: ${product.stock}`}
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50/50">
                    <p className="text-xs font-bold truncate">{product.name}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[10px] text-slate-500">BDT {product.price.toLocaleString()}</p>
                      {product.category && <span className="text-[9px] font-bold uppercase text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded">{product.category}</span>}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Fixed Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 p-6 ios-blur border-t border-slate-200 z-10 flex justify-center">
        <div className="max-w-md w-full">
          <button 
            onClick={() => handleOpenModal()}
            className="premium-active w-full bg-violet-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-violet-200"
          >
            <Plus className="w-5 h-5" />
            ADD NEW PRODUCT
          </button>
        </div>
      </div>

      {/* Product Modal — Multi-Step Wizard */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl premium-shadow overflow-hidden border border-slate-100"
            >
              {/* Progress Indicator */}
              <div className="px-6 pt-5 pb-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`h-1 flex-1 rounded-full transition-colors duration-300 ${formStep >= 1 ? 'bg-violet-600' : 'bg-slate-200'}`} />
                  <div className={`h-1 flex-1 rounded-full transition-colors duration-300 ${formStep >= 2 ? 'bg-violet-600' : 'bg-slate-200'}`} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">
                  Step {formStep} of 2
                </p>
              </div>

              {/* Header */}
              <div className="px-6 pt-2 pb-4">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={formStep === 1 ? closeModal : () => setFormStep(1)}
                    className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center active:scale-90 transition-all flex-shrink-0"
                  >
                    <ArrowLeft className="w-5 h-5 text-slate-700" />
                  </button>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">
                      {editingProduct ? 'Edit Product' : 'Add New Product'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {formStep === 1 ? 'Product details' : 'Product image'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Step Content with Animated Transitions */}
              <div className="relative overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  {formStep === 1 && (
                    <motion.div
                      key="step-1"
                      initial={{ x: -40, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -40, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="px-6 pb-6"
                    >
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block">Product Name</label>
                          <input 
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            className="w-full bg-slate-50 border-none rounded-xl py-3.5 px-4 focus:ring-2 focus:ring-violet-500 text-sm"
                            placeholder="e.g. Cricket Bat"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block">Category</label>
                          <div className="flex gap-2 flex-wrap">
                            {PRODUCT_CATEGORIES.map(cat => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setFormData({...formData, category: cat})}
                                className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
                                  formData.category === cat
                                    ? 'bg-violet-600 text-white shadow-md shadow-violet-200'
                                    : 'bg-slate-100 text-slate-500 active:scale-95'
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block">Buying Price</label>
                            <input 
                              type="number"
                              value={formData.price}
                              onChange={e => setFormData({...formData, price: e.target.value})}
                              className="w-full bg-slate-50 border-none rounded-xl py-3.5 px-4 focus:ring-2 focus:ring-violet-500 text-sm"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block">Initial Stock</label>
                            <input 
                              type="number"
                              value={formData.stock}
                              onChange={e => setFormData({...formData, stock: e.target.value})}
                              className="w-full bg-slate-50 border-none rounded-xl py-3.5 px-4 focus:ring-2 focus:ring-violet-500 text-sm"
                              placeholder="0"
                            />
                          </div>
                        </div>

                        <button 
                          type="button"
                          onClick={() => {
                            if (!formData.name || !formData.price || !formData.stock) {
                              alert('Please fill in all required fields.');
                              return;
                            }
                            setFormStep(2);
                          }}
                          className="premium-active w-full bg-slate-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg mt-2 shadow-slate-200"
                        >
                          Next: Add Image
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {formStep === 2 && (
                    <motion.div
                      key="step-2"
                      initial={{ x: 40, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: 40, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="px-6 pb-6"
                    >
                      <div className="space-y-4">
                        {/* Image Preview */}
                        {formData.image ? (
                          <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                            <img 
                              src={formData.image} 
                              alt="Preview" 
                              className="w-full h-full object-cover"
                            />
                            <button 
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, image: '' }))}
                              className="absolute top-3 right-3 p-2 bg-black/50 text-white rounded-xl backdrop-blur-sm active:scale-90 transition-all"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <div className="absolute bottom-3 left-3 bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Image Added
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            {/* Upload from Gallery */}
                            <label className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center cursor-pointer active:bg-slate-100 transition-colors">
                              <div className="flex flex-col items-center gap-2 text-slate-400">
                                <div className="w-14 h-14 bg-violet-100 rounded-2xl flex items-center justify-center">
                                  <Upload className="w-7 h-7 text-violet-500" />
                                </div>
                                <span className="text-[11px] font-bold text-slate-500">Gallery</span>
                              </div>
                              <input 
                                type="file" 
                                accept="image/*" 
                                onChange={handleImageUpload}
                                className="hidden" 
                              />
                            </label>
                            {/* Take Photo with Camera */}
                            <label className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center cursor-pointer active:bg-slate-100 transition-colors">
                              <div className="flex flex-col items-center gap-2 text-slate-400">
                                <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center">
                                  <Camera className="w-7 h-7 text-amber-500" />
                                </div>
                                <span className="text-[11px] font-bold text-slate-500">Camera</span>
                              </div>
                              <input 
                                type="file" 
                                accept="image/*" 
                                capture="environment"
                                onChange={handleImageUpload}
                                className="hidden" 
                              />
                            </label>
                          </div>
                        )}

                        {/* URL Input */}
                        <div className="relative">
                          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <ImageIcon className="w-4 h-4 text-slate-400" />
                          </div>
                          <input 
                            type="url"
                            value={formData.image}
                            onChange={e => setFormData({...formData, image: e.target.value})}
                            className="w-full bg-slate-50 border-none rounded-xl py-3.5 pl-10 pr-4 text-xs focus:ring-2 focus:ring-violet-500"
                            placeholder="Or paste image URL..."
                          />
                        </div>

                        {/* Skip / Submit */}
                        <div className="flex flex-col gap-2 mt-2">
                          <button 
                            type="button"
                            onClick={handleSaveProduct}
                            disabled={isSaving}
                            className={`premium-active w-full text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all ${isSaving ? 'bg-violet-400 cursor-not-allowed shadow-none' : 'bg-violet-600 shadow-violet-200'}`}
                          >
                            <Check className={`w-5 h-5 ${isSaving ? 'animate-bounce' : ''}`} />
                            {isSaving ? 'Saving...' : (editingProduct ? 'Update Product' : 'Create Product')}
                          </button>
                          {!formData.image && (
                            <button 
                              type="button"
                              onClick={handleSaveProduct}
                              disabled={isSaving}
                              className={`premium-active w-full py-3 rounded-2xl font-bold text-sm transition-all ${isSaving ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400'}`}
                            >
                              Skip — Add image later
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sales Details Modal */}
      <AnimatePresence>
        {isSalesModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 premium-shadow max-h-[80vh] flex flex-col border border-slate-100"
            >
              <div className="flex items-center gap-3 mb-6 flex-shrink-0">
                <button 
                  onClick={closeModal}
                  className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center active:scale-90 transition-all flex-shrink-0"
                >
                  <ArrowLeft className="w-5 h-5 text-slate-700" />
                </button>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Today's Sales</h3>
                  <p className="text-xs text-slate-500">
                    {sales.filter(s => new Date(s.timestamp).toDateString() === new Date().toDateString()).length} transactions recorded
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
                {sales.filter(s => new Date(s.timestamp).toDateString() === new Date().toDateString()).length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <History className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-slate-400 font-medium">No sales recorded yet today</p>
                  </div>
                ) : (
                  sales
                    .filter(s => new Date(s.timestamp).toDateString() === new Date().toDateString())
                    .map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-100">
                          <Package className="w-5 h-5 text-violet-500" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{sale.productName}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500">
                              {new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                            <span className="text-[10px] font-bold text-violet-500 uppercase">Qty: {sale.quantity || 1}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm font-black text-slate-900">BDT {sale.price.toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100 flex-shrink-0">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Total Revenue</p>
                  <p className="text-xl font-black text-violet-600">BDT {salesToday.toLocaleString()}</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Low Stock Modal */}
      <AnimatePresence>
        {isLowStockModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 premium-shadow max-h-[80vh] flex flex-col border border-slate-100"
            >
              <div className="flex items-center gap-3 mb-6 flex-shrink-0">
                <button 
                  onClick={closeModal}
                  className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center active:scale-90 transition-all flex-shrink-0"
                >
                  <ArrowLeft className="w-5 h-5 text-slate-700" />
                </button>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Low Stock Items</h3>
                  <p className="text-xs text-slate-500">
                    {lowStockCount} {lowStockCount === 1 ? 'item' : 'items'} with stock below 5
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
                {lowStockCount === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Package className="w-8 h-8 text-emerald-300" />
                    </div>
                    <p className="text-slate-400 font-medium">All items are well stocked!</p>
                  </div>
                ) : (
                  products
                    .filter(p => p.stock < 5)
                    .sort((a, b) => a.stock - b.stock)
                    .map((product) => (
                    <div key={product.id} className="flex items-center justify-between p-4 bg-rose-50 rounded-2xl border border-rose-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl overflow-hidden border border-rose-100 flex-shrink-0">
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{product.name}</p>
                          <div className="flex items-center gap-2">
                            {product.category && (
                              <span className="text-[10px] font-bold text-violet-500 uppercase">{product.category}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-black text-rose-500">{product.stock}</p>
                        <p className="text-[10px] text-rose-400 font-bold uppercase">in stock</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
