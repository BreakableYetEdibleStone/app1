/**
 * Application State and Controller Engine
 */
const AppState = {
  transactions: [],
  categories: [],
  filterPeriod: 'THIS_MONTH',
  currentPage: 1,
  editingId: null
};

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadData();
});

function setupEventListeners() {
  document.getElementById('btn-add-txn').addEventListener('click', () => openTxnModal());
  document.getElementById('txn-form').addEventListener('submit', handleFormSubmit);
  document.getElementById('period-select').addEventListener('change', (e) => {
    AppState.filterPeriod = e.target.value;
    renderDashboard();
  });
}

async function loadData() {
  showLoading(true);
  try {
    const [txnRes, catRes] = await Promise.all([
      ApiClient.get('listTransactions'),
      ApiClient.get('listCategories')
    ]);

    AppState.transactions = txnRes.data || [];
    AppState.categories = catRes.data || [];

    populateCategoryDropdown();
    renderDashboard();
    renderTransactionsTable();
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + err.message);
  } finally {
    showLoading(false);
  }
}

function renderDashboard() {
  const filtered = filterTransactionsByPeriod(AppState.transactions, AppState.filterPeriod);
  
  let income = 0;
  let expense = 0;

  filtered.forEach(t => {
    const amt = parseFloat(t['จำนวนเงิน']) || 0;
    if (t['ประเภท'] === 'รายรับ') income += amt;
    if (t['ประเภท'] === 'รายจ่าย') expense += amt;
  });

  const balance = income - expense;
  const savingsRate = income > 0 ? ((balance / income) * 100).toFixed(1) : '0';

  document.getElementById('val-balance').textContent = formatCurrency(balance);
  document.getElementById('val-income').textContent = formatCurrency(income);
  document.getElementById('val-expense').textContent = formatCurrency(expense);
  document.getElementById('val-savings').textContent = `${savingsRate}%`;

  renderCharts(filtered);
}

function renderCharts(records) {
  // สร้างหรืออัปเดต Chart JS สัดส่วนรายจ่ายตามหมวดหมู่
  const categoryTotals = {};
  records.filter(r => r['ประเภท'] === 'รายจ่าย').forEach(r => {
    const cat = r['หมวดหมู่'] || 'อื่น ๆ';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (parseFloat(r['จำนวนเงิน']) || 0);
  });

  const ctx = document.getElementById('chart-category').getContext('2d');
  if (window.categoryChartInstance) window.categoryChartInstance.destroy();

  window.categoryChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(categoryTotals),
      datasets: [{
        data: Object.values(categoryTotals),
        backgroundColor: ['#8CC8F0', '#F28B82', '#4D9B78', '#FCD34D', '#A78BFA', '#F472B6', '#9CA3AF']
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function renderTransactionsTable() {
  const tbody = document.getElementById('txn-table-body');
  tbody.innerHTML = '';

  if (AppState.transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">ไม่พบรายการบันทึก</td></tr>';
    return;
  }

  AppState.transactions.forEach(t => {
    const tr = document.createElement('tr');
    const isIncome = t['ประเภท'] === 'รายรับ';
    
    tr.innerHTML = `
      <td>${t['วันที่'] || '-'}</td>
      <td><span class="${isIncome ? 'text-income' : 'text-expense'}">${t['ประเภท']}</span></td>
      <td>${t['หมวดหมู่'] || '-'}</td>
      <td>${t['รายละเอียด'] || '-'}</td>
      <td style="text-align:right;" class="${isIncome ? 'text-income' : 'text-expense'}">${formatCurrency(t['จำนวนเงิน'])}</td>
      <td style="text-align:center;">
        <button class="btn btn-secondary" onclick="editTxn('${t['Transaction ID']}')">แก้ไข</button>
        <button class="btn btn-danger" onclick="deleteTxn('${t['Transaction ID']}')">ลบ</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const btnSubmit = document.getElementById('btn-save');
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'กำลังบันทึก...';

  try {
    const fileInput = document.getElementById('form-file');
    let imageUrl = document.getElementById('form-img-url').value;

    if (fileInput.files.length > 0) {
      const uploadRes = await uploadFile(fileInput.files[0]);
      imageUrl = uploadRes.data.url;
    }

    const payloadData = {
      date: document.getElementById('form-date').value,
      type: document.getElementById('form-type').value,
      amount: document.getElementById('form-amount').value,
      category: document.getElementById('form-category').value,
      details: document.getElementById('form-details').value,
      paymentMethod: document.getElementById('form-method').value,
      account: document.getElementById('form-account').value,
      imageUrl: imageUrl,
      note: document.getElementById('form-note').value
    };

    if (AppState.editingId) {
      await ApiClient.post('updateTransaction', { id: AppState.editingId, data: payloadData });
    } else {
      await ApiClient.post('createTransaction', { data: payloadData });
    }

    closeTxnModal();
    await loadData();
  } catch (err) {
    alert('ไม่สามารถบันทึกได้: ' + err.message);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'บันทึกรายการ';
  }
}

async function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result.split(',')[1];
        const res = await ApiClient.post('uploadImage', {
          base64Data: base64Data,
          mimeType: file.type,
          fileName: file.name
        });
        resolve(res);
      } catch (err) { reject(err); }
    };
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

async function deleteTxn(id) {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?')) return;
  try {
    await ApiClient.post('deleteTransaction', { id: id });
    await loadData();
  } catch (err) {
    alert('ลบไม่สำเร็จ: ' + err.message);
  }
}

function openTxnModal() {
  AppState.editingId = null;
  document.getElementById('txn-form').reset();
  document.getElementById('form-date').value = new Date().toISOString().substring(0, 10);
  document.getElementById('modal-title').textContent = 'เพิ่มรายการใหม่';
  document.getElementById('modal-txn').classList.add('active');
}

function closeTxnModal() {
  document.getElementById('modal-txn').classList.remove('active');
}

function populateCategoryDropdown() {
  const select = document.getElementById('form-category');
  select.innerHTML = '';
  AppState.categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c['ชื่อหมวดหมู่'];
    opt.textContent = `${c['ประเภท']} - ${c['ชื่อหมวดหมู่']}`;
    select.appendChild(opt);
  });
}

function filterTransactionsByPeriod(records, period) {
  const now = new Date();
  return records.filter(r => {
    if (!r['วันที่']) return false;
    const d = new Date(r['วันที่']);
    if (period === 'THIS_MONTH') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount || 0);
}

function showLoading(show) {
  document.getElementById('loading-spinner').style.display = show ? 'block' : 'none';
}