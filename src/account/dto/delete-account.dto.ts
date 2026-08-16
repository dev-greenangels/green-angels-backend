import { Equals, IsString } from 'class-validator'

export class DeleteAccountDto {
  @IsString({ message: 'Введіть слово DELETE для підтвердження.' })
  @Equals('DELETE', { message: 'Для підтвердження введіть слово DELETE.' })
  confirm!: string
}
