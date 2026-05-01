import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { useCreateSale } from '@/data/sales';
import { PLAN_DEFAULT_PRICE } from '@/types/domain';

const schema = z.object({
  email: z.string().min(1, 'Required').email('Invalid email'),
  category: z.enum(['stripe', 'nowpayments']),
  plan: z.enum(['1m', '3m']),
  paid_amount: z.coerce.number().positive('Must be > 0'),
  transaction_date: z.string().min(1, 'Required'),
  notes: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

export function SaleForm() {
  const create = useCreateSale();
  const today = format(new Date(), 'yyyy-MM-dd');

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      category: 'stripe',
      plan: '1m',
      paid_amount: PLAN_DEFAULT_PRICE['1m'],
      transaction_date: today,
      notes: '',
    },
  });

  const plan = watch('plan');
  const userEditedPriceRef = useRef(false);

  useEffect(() => {
    if (!userEditedPriceRef.current) {
      setValue('paid_amount', PLAN_DEFAULT_PRICE[plan]);
    }
  }, [plan, setValue]);

  const onSubmit = (values: FormValues) => {
    create.mutate(values, {
      onSuccess: () => {
        reset({
          email: '',
          category: values.category,
          plan: values.plan,
          paid_amount: PLAN_DEFAULT_PRICE[values.plan],
          transaction_date: today,
          notes: '',
        });
        userEditedPriceRef.current = false;
      },
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white border border-gray-200 rounded-lg p-4 space-y-3"
    >
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-gray-600 mb-1">Customer email</label>
          <input
            type="email"
            {...register('email')}
            placeholder="customer@example.com"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500"
          />
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Category</label>
          <select
            {...register('category')}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500"
          >
            <option value="stripe">Stripe</option>
            <option value="nowpayments">NowPayments</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Plan</label>
          <select
            {...register('plan')}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500"
          >
            <option value="1m">1 month ($39)</option>
            <option value="3m">3 months ($70)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Paid (USD)</label>
          <input
            type="number"
            step="0.01"
            {...register('paid_amount', {
              onChange: () => {
                userEditedPriceRef.current = true;
              },
            })}
            className="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500"
          />
          {errors.paid_amount && (
            <p className="text-xs text-red-600 mt-1">{errors.paid_amount.message}</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Transaction date</label>
          <input
            type="date"
            {...register('transaction_date')}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">Notes (optional)</label>
        <input
          type="text"
          {...register('notes')}
          placeholder="e.g. promo code, referral source"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={create.isPending}
          className="bg-gray-900 text-white rounded px-4 py-1.5 text-sm hover:bg-black disabled:opacity-50"
        >
          {create.isPending ? 'Saving...' : 'Add sale'}
        </button>
        {create.isError && (
          <span className="text-xs text-red-600">{(create.error as Error).message}</span>
        )}
        {create.isSuccess && !create.isPending && (
          <span className="text-xs text-green-700">Saved.</span>
        )}
      </div>
    </form>
  );
}
