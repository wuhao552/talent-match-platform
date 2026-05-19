import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

export type UserRole = 'individual' | 'enterprise' | 'admin'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ unique: true, length: 64 })
  username: string

  @Column({ name: 'password_hash', length: 256 })
  passwordHash: string

  @Column({ type: 'varchar', length: 20 })
  role: UserRole

  @Column({ nullable: true, length: 128 })
  email: string

  @Column({ nullable: true, length: 32 })
  phone: string

  @Column({ nullable: true, length: 64 })
  city: string

  @Column({ name: 'intended_cities', type: 'text', array: true, nullable: true })
  intendedCities: string[]

  @Column({ name: 'company_name', nullable: true, length: 128 })
  companyName: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
