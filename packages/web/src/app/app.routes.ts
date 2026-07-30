import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    loadComponent: () => import('./screens/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'customers',
    loadComponent: () =>
      import('./screens/customers-list.component').then((m) => m.CustomersListComponent),
  },
  {
    path: 'customers/new',
    loadComponent: () =>
      import('./screens/customer-new.component').then((m) => m.CustomerNewComponent),
  },
  {
    path: 'customers/:id',
    loadComponent: () =>
      import('./screens/customer-detail.component').then((m) => m.CustomerDetailComponent),
  },
  {
    path: 'suppliers',
    loadComponent: () =>
      import('./screens/suppliers-list.component').then((m) => m.SuppliersListComponent),
  },
  {
    path: 'suppliers/:id',
    loadComponent: () =>
      import('./screens/supplier-detail.component').then((m) => m.SupplierDetailComponent),
  },
  {
    path: 'manufacturers',
    loadComponent: () =>
      import('./screens/manufacturers-list.component').then((m) => m.ManufacturersListComponent),
  },
  {
    path: 'manufacturers/:id',
    loadComponent: () =>
      import('./screens/manufacturer-detail.component').then((m) => m.ManufacturerDetailComponent),
  },
  {
    path: 'products',
    loadComponent: () =>
      import('./screens/products-list.component').then((m) => m.ProductsListComponent),
  },
  {
    path: 'products/:id',
    loadComponent: () =>
      import('./screens/product-detail.component').then((m) => m.ProductDetailComponent),
  },
  {
    path: 'warehouses',
    loadComponent: () =>
      import('./screens/warehouses-list.component').then((m) => m.WarehousesListComponent),
  },
  {
    path: 'warehouses/:id',
    loadComponent: () =>
      import('./screens/warehouse-detail.component').then((m) => m.WarehouseDetailComponent),
  },
  {
    path: 'stock',
    loadComponent: () => import('./screens/stock-list.component').then((m) => m.StockListComponent),
  },
  {
    path: 'requisitions',
    loadComponent: () =>
      import('./screens/requisitions-list.component').then((m) => m.RequisitionsListComponent),
  },
  {
    path: 'requisitions/new',
    loadComponent: () =>
      import('./screens/requisition-new.component').then((m) => m.RequisitionNewComponent),
  },
  {
    path: 'requisitions/:id',
    loadComponent: () =>
      import('./screens/requisition-detail.component').then((m) => m.RequisitionDetailComponent),
  },
  {
    path: 'backorders',
    loadComponent: () =>
      import('./screens/backorders-list.component').then((m) => m.BackordersListComponent),
  },
  {
    path: 'invoices',
    loadComponent: () =>
      import('./screens/invoices-list.component').then((m) => m.InvoicesListComponent),
  },
  {
    path: 'invoices/:id',
    loadComponent: () =>
      import('./screens/invoice-detail.component').then((m) => m.InvoiceDetailComponent),
  },
  {
    path: 'payments',
    loadComponent: () =>
      import('./screens/payments-list.component').then((m) => m.PaymentsListComponent),
  },
  {
    path: 'payments/new',
    loadComponent: () =>
      import('./screens/payment-new.component').then((m) => m.PaymentNewComponent),
  },
  {
    path: 'export',
    loadComponent: () => import('./screens/export.component').then((m) => m.ExportComponent),
  },
  {
    path: 'performance',
    loadComponent: () =>
      import('./screens/performance.component').then((m) => m.PerformanceComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
