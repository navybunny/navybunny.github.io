---
title: "C++ 通讯录管理系统"
date: 2021-04-13 12:00:00
tags: [C++, 数据结构, 文件操作, 学习笔记]
categories: 编程
---



## 前言

这是一个基于黑马程序员 C++ 教程修改而来的通讯录管理系统。在原版基础上，我添加了一些输入校验和确认机制。不过由于个人能力有限，这个程序仍存在不少瑕疵，主要集中在以下三点：

1. 输入年龄、性别等数字选项时，如果**不小心输入了非数字字符**，程序会陷入死循环。
2. 联系人数组满员（1000人）后，执行删除操作时会因为尝试移动并不存在的 `personArray[1000]` 而导致**数组越界**。大佬建议使用链表来优化。
3. **程序关闭后所有数据丢失**，因为没有结合文件操作进行持久化存储。

写下这篇文章，既是对自己学习过程的记录，也希望能帮到遇到同样问题的同学。下面是完整的程序源码，以及针对上述问题的分析与改进思路。

<!--more-->

---

## 完整程序源码

```cpp
#include <iostream>
#include <string>
#define MAX 1000
using namespace std;

// 联系人结构体
struct Person {
    string name;
    int sex;      // 1-男  2-女
    int age;
    string phone;
    string addr;
};

// 通讯录结构体
struct AddressBooks {
    Person personArray[MAX];
    int size;     // 当前已存储的联系人数量
};

// 1. 添加联系人
void addPerson(AddressBooks *abs) {
    if (abs->size == MAX) {
        cout << "通讯录已满，无法添加！" << endl;
        system("pause");
        system("cls");
        return;
    }
    // 姓名
    string name;
    cout << "请输入姓名: ";
    cin >> name;
    abs->personArray[abs->size].name = name;

    // 性别
    cout << "请输入性别：" << endl;
    cout << "1—男" << endl;
    cout << "2—女" << endl;
    int sex = 0;
    while (true) {
        cin >> sex;
        if (cin.fail()) {                    // 处理非数字输入
            cin.clear();
            cin.ignore(1024, '\n');
            cout << "输入无效，请重新输入性别(1或2): ";
            continue;
        }
        if (sex == 1 || sex == 2) {
            abs->personArray[abs->size].sex = sex;
            break;
        }
        cout << "性别输入错误，请重新输入: ";
    }

    // 年龄
    cout << "请输入年龄: ";
    int age;
    while (true) {
        cin >> age;
        if (cin.fail()) {
            cin.clear();
            cin.ignore(1024, '\n');
            cout << "输入无效，请输入数字年龄(0-150): ";
            continue;
        }
        if (age >= 0 && age <= 150) {
            abs->personArray[abs->size].age = age;
            break;
        }
        cout << "年龄输入错误，请重新输入: ";
    }

    // 电话
    cout << "请输入联系电话：";
    string phone;
    cin >> phone;
    abs->personArray[abs->size].phone = phone;

    // 住址
    cout << "请输入家庭住址：";
    string addr;
    cin >> addr;
    abs->personArray[abs->size].addr = addr;

    abs->size++;
    cout << "添加成功" << endl;
    system("pause");
    system("cls");
}

// 2. 显示所有联系人
void showPerson(AddressBooks *abs) {
    if (abs->size == 0) {
        cout << "当前记录为空" << endl;
    } else {
        for (int i = 0; i < abs->size; i++) {
            cout << "姓名：" << abs->personArray[i].name << "\t";
            cout << "性别：" << (abs->personArray[i].sex == 1 ? "男" : "女") << "\t";
            cout << "年龄：" << abs->personArray[i].age << "\t";
            cout << "电话：" << abs->personArray[i].phone << "\t";
            cout << "住址：" << abs->personArray[i].addr << endl;
        }
    }
    system("pause");
    system("cls");
}

// 检测联系人是否存在（返回索引，否则返回-1）
int isExist(AddressBooks *abs, string name) {
    for (int i = 0; i < abs->size; i++) {
        if (abs->personArray[i].name == name)
            return i;
    }
    return -1;
}

// 3. 删除联系人（已修复越界问题）
void deletePerson(AddressBooks *abs) {
    cout << "请输入您要删除的联系人姓名: ";
    string name;
    cin >> name;
    int ret = isExist(abs, name);
    if (ret != -1) {
        cout << "您是否要删除 \"" << name << "\" 的信息?" << endl;
        cout << "1———是" << endl;
        cout << "2———否" << endl;
        int choice = 0;
        while (true) {
            cin >> choice;
            if (cin.fail()) {
                cin.clear();
                cin.ignore(1024, '\n');
                cout << "输入无效，请选择1或2: ";
                continue;
            }
            if (choice == 1) {
                // 数据前移（防止越界：i+1 必须小于 size）
                for (int i = ret; i < abs->size - 1; i++) {
                    abs->personArray[i] = abs->personArray[i + 1];
                }
                abs->size--;
                cout << "删除成功" << endl;
                break;
            } else if (choice == 2) {
                cout << "已取消删除" << endl;
                break;
            } else {
                cout << "输入错误，请重新输入: ";
            }
        }
    } else {
        cout << "查无此人" << endl;
    }
    system("pause");
    system("cls");
}

// 4. 查找联系人
void findPerson(AddressBooks *abs) {
    cout << "请输入您要查找的联系人姓名: ";
    string name;
    cin >> name;
    int ret = isExist(abs, name);
    if (ret != -1) {
        cout << "姓名：" << abs->personArray[ret].name << "\t";
        cout << "性别：" << (abs->personArray[ret].sex == 1 ? "男" : "女") << "\t";
        cout << "年龄：" << abs->personArray[ret].age << "\t";
        cout << "电话：" << abs->personArray[ret].phone << "\t";
        cout << "住址：" << abs->personArray[ret].addr << endl;
    } else {
        cout << "查无此人" << endl;
    }
    system("pause");
    system("cls");
}

// 5. 修改联系人信息
void modifyPerson(AddressBooks *abs) {
    cout << "请输入您要修改的联系人姓名: ";
    string name;
    cin >> name;
    int ret = isExist(abs, name);
    if (ret != -1) {
        // 修改姓名
        cout << "请输入新姓名: ";
        cin >> abs->personArray[ret].name;
        // 修改性别
        cout << "请输入新性别（1-男  2-女）: ";
        int sex = 0;
        while (true) {
            cin >> sex;
            if (cin.fail()) {
                cin.clear();
                cin.ignore(1024, '\n');
                cout << "输入无效，请重新输入: ";
                continue;
            }
            if (sex == 1 || sex == 2) {
                abs->personArray[ret].sex = sex;
                break;
            }
            cout << "输入错误，请重新输入: ";
        }
        // 修改年龄
        cout << "请输入新年龄: ";
        int age = 0;
        while (true) {
            cin >> age;
            if (cin.fail()) {
                cin.clear();
                cin.ignore(1024, '\n');
                cout << "输入无效，请重新输入: ";
                continue;
            }
            if (age >= 0 && age <= 150) {
                abs->personArray[ret].age = age;
                break;
            }
            cout << "输入错误，请重新输入: ";
        }
        // 修改电话
        cout << "请输入新电话: ";
        cin >> abs->personArray[ret].phone;
        // 修改地址
        cout << "请输入新住址: ";
        cin >> abs->personArray[ret].addr;
        cout << "修改成功" << endl;
    } else {
        cout << "查无此人" << endl;
    }
    system("pause");
    system("cls");
}

// 6. 清空联系人
void cleanPerson(AddressBooks *abs) {
    cout << "您是否要清除全部联系人的信息？" << endl;
    cout << "1———是" << endl;
    cout << "2———否" << endl;
    int choice = 0;
    while (true) {
        cin >> choice;
        if (cin.fail()) {
            cin.clear();
            cin.ignore(1024, '\n');
            cout << "输入无效，请选择1或2: ";
            continue;
        }
        if (choice == 1) {
            abs->size = 0;   // 逻辑清空
            cout << "通讯录已清空" << endl;
            break;
        } else if (choice == 2) {
            cout << "已取消清空" << endl;
            break;
        } else {
            cout << "输入错误，请重新输入: ";
        }
    }
    system("pause");
    system("cls");
}

// 菜单
void showMenu() {
    cout << "***************************" << endl;
    cout << "***** 1、添加联系人 *****" << endl;
    cout << "***** 2、显示联系人 *****" << endl;
    cout << "***** 3、删除联系人 *****" << endl;
    cout << "***** 4、查找联系人 *****" << endl;
    cout << "***** 5、修改联系人 *****" << endl;
    cout << "***** 6、清空联系人 *****" << endl;
    cout << "***** 0、退出通讯录 *****" << endl;
    cout << "***************************" << endl;
}

int main() {
    AddressBooks abs;
    abs.size = 0;
    int select = 0;

    while (true) {
        showMenu();
        cin >> select;
        if (cin.fail()) {   // 菜单选择也做防护
            cin.clear();
            cin.ignore(1024, '\n');
            cout << "请输入数字选项！" << endl;
            system("pause");
            system("cls");
            continue;
        }

        switch (select) {
            case 1: addPerson(&abs);    break;
            case 2: showPerson(&abs);   break;
            case 3: deletePerson(&abs); break;
            case 4: findPerson(&abs);   break;
            case 5: modifyPerson(&abs); break;
            case 6: cleanPerson(&abs);  break;
            case 0:
                cout << "欢迎下次使用，再见！" << endl;
                system("pause");
                return 0;
            default:
                cout << "选项错误，请重新选择" << endl;
                system("pause");
                system("cls");
                break;
        }
    }
    return 0;
}
