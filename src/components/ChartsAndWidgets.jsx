import React from 'react';
import { Icon, formatCurrencyVal } from '../utils.jsx';

export const FinancialInsightsPanel = ({ transactions, settings, setActivePage }) => {
    const formatCurrency = (val) => formatCurrencyVal(val, settings.currency || "INR");

    const expenseTx = transactions.filter(t => t.type === "expense");
    const incomeTx = transactions.filter(t => t.type === "income");

    const incomeSum = incomeTx.reduce((s, t) => s + t.amount, 0);
    const spendingSum = expenseTx.reduce((s, t) => s + t.amount, 0);
    const netCashFlow = incomeSum - spendingSum;
    const savingsRate = incomeSum > 0 ? ((netCashFlow / incomeSum) * 100) : 0;

    const needsReviewCount = transactions.filter(t => t.category === "Needs review").length;

    const now = new Date();
    const currentDay = Math.max(1, now.getDate());
    const dailySpend = spendingSum > 0 ? spendingSum / currentDay : 0;

    return (
        <div className="card p-4 mb-4">
            <h3 className="text-lg font-semibold mb-2">Financial Insights</h3>
            <div className="grid grid-cols-2 gap-4">
                <div>Daily Average Spend: {formatCurrency(dailySpend)}</div>
                <div>Savings Rate: {savingsRate.toFixed(1)}%</div>
            </div>
        </div>
    );
};
