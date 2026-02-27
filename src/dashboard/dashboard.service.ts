import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/auth/user.entity';
import { Budget } from 'src/budgets/budget.entity';
import { Expense } from 'src/expenses/expense.entity';
import { Repository } from 'typeorm';

interface SpentResult {
  total: string | null;
  count: string | null;
  average: string | null;
}

interface BudgetResult {
  total: string | null;
}

interface CategoryBreakdownResult {
  categoryName: string;
  categoryId: string;
  totalSpent: string;
  expenseCount: string;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Expense)
    private expensesRepository: Repository<Expense>,
    @InjectRepository(Budget)
    private budgetsRepository: Repository<Budget>,
  ) {}

  async getStats(user: User): Promise<any> {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    //Total spent this month
    const spentResult = (await this.expensesRepository
      .createQueryBuilder('expense')
      .select('SUM(expense.amount)', 'total')
      .addSelect('COUNT(expense.id)', 'count')
      .addSelect('AVG(expense.amount)', 'average')
      .where('expense.userId = :userId', { userId: user.id })
      .andWhere('MONTH(expense.date) = :month', { month })
      .andWhere('YEAR(expense.date) = :year', { year })
      .getRawOne()) as SpentResult;

    //Budget for this month
    const budgetResult = (await this.budgetsRepository
      .createQueryBuilder('budget')
      .select('SUM(budget.limit)', 'total')
      .where('budget.userId = :userId', { userId: user.id })
      .andWhere('budget.month = :month', { month })
      .andWhere('budget.year = :year', { year })
      .getRawOne()) as BudgetResult;

    const totalSpent = parseFloat(spentResult.total ?? '0') || 0;
    const totalBudget = parseFloat(budgetResult.total ?? '0') || 0;

    const categoryBreakdown = await this.getCategoryBreakdown(
      user.id,
      month,
      year,
    );

    const topExpenses = await this.expensesRepository.find({
      where: { userId: user.id },
      order: { amount: 'DESC' },
      take: 5,
    });

    const budgetUtilization =
      totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : 0;

    return {
      currentMonth: {
        totalSpent,
        totalBudget,
        budgetUtilization: budgetUtilization,
        expenseCount: parseInt(spentResult.count ?? '0') || 0,
        averageExpense: parseFloat(spentResult.average ?? '0') || 0,
      },
      categoryBreakdown,
      topExpenses,
    };
  }

  async getCategoryBreakdown(
    userId: string,
    month: number,
    year: number,
  ): Promise<CategoryBreakdownResult[]> {
    const expenses: CategoryBreakdownResult[] = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('category.name', 'categoryName')
      .addSelect('category.icon', 'categoryIcon')
      .addSelect('SUM(expense.amount)', 'totalSpent')
      .addSelect('COUNT(expense.id)', 'expenseCount')
      .innerJoin('expense.category', 'category')
      .where('expense.userId = :userId', { userId })
      .andWhere('MONTH(expense.date) = :month', { month })
      .andWhere('YEAR(expense.date) = :year', { year })
      .groupBy('category.id')
      .orderBy('totalSpent', 'DESC')
      .getRawMany();

    return expenses;
  }

  async getTrends(user: User): Promise<any> {
    const months: { month: string; totalSpent: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();

      const spent = (await this.expensesRepository
        .createQueryBuilder('expense')
        .select('SUM(expense.amount)', 'total')
        .where('expense.userId = :userId', { userId: user.id })
        .andWhere('MONTH(expense.date) = :month', { month })
        .andWhere('YEAR(expense.date) = :year', { year })
        .getRawOne()) as BudgetResult;

      months.push({
        month: date.toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        }),
        totalSpent: parseFloat(spent.total ?? '0') || 0,
      });
    }

    return { months };
  }
}
